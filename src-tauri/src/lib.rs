//! SocialManager 桌面客户端入口
//!
//! 职责：
//! 1. 定位 Node 运行时（优先使用随包分发的 node.exe，开发环境回退到系统 PATH 中的 node）
//! 2. 首次启动时将随包分发的 backend.tar 解包到 %APPDATA%/SocialManager/runtime
//! 3. 分配空闲端口并拉起内置 NestJS 后端（sidecar 进程，cwd = runtime 目录）
//! 4. 轮询后端就绪后，创建主窗口加载 http://127.0.0.1:<port>/
//! 5. 应用退出时清理后端子进程
//!
//! 前端与 API 保持同源（均由 NestJS 提供），前端代码无需任何改动。

use std::{
    fs::{File, OpenOptions},
    io::Write,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// 主窗口标签
const MAIN_WINDOW_LABEL: &str = "main";
/// 后端就绪最长等待时间（秒）
const BACKEND_READY_TIMEOUT: Duration = Duration::from_secs(60);
/// 数据库初始化最长等待时间（秒）
const DB_INIT_TIMEOUT: Duration = Duration::from_secs(25);

/// 持有后端子进程句柄，退出时清理
struct BackendState(Mutex<Option<Child>>);

/// 在 127.0.0.1 上找一段空闲端口
fn find_free_port() -> Option<u16> {
    TcpListener::bind(("127.0.0.1", 0))
        .ok()
        .and_then(|listener| listener.local_addr().ok().map(|addr| addr.port()))
}

/// 探测端口是否已可连接（后端已监听即视为就绪）
fn port_open(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

/// 追加写日志行（后端日志与应用日志）
fn append_log(file: &mut File, line: &str) {
    let _ = writeln!(file, "{line}");
    let _ = file.flush();
}

/// 应用数据目录：%APPDATA%/SocialManager
fn appdata_root() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    Some(Path::new(&appdata).join("SocialManager"))
}

fn appdata_log_dir() -> Option<PathBuf> {
    let dir = appdata_root()?.join("logs");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// 解析用户级 env.local（%APPDATA%/SocialManager/env.local）
/// 格式：每行 `KEY=VALUE`，`#` 开头为注释，空行忽略
fn parse_env_file(path: &Path) -> Vec<(String, String)> {
    let Ok(content) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    content
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with('#') && t.contains('=')
        })
        .filter_map(|l| {
            let (k, v) = l.split_once('=')?;
            // 剥离 UTF-8 BOM（部分编辑器写入的 env.local 会带 BOM）
            Some((
                k.trim_start_matches('\u{feff}').trim().to_string(),
                v.trim().to_string(),
            ))
        })
        .collect()
}

/// 定位资源基础目录（backend.tar 与 node/node.exe 所在目录）。
/// Windows 上 resource_dir() 恒为 exe 所在目录；tauri-build 会把 ../ 开头的资源映射为
/// `_up_/...` 相对路径，安装包则可能置于 resources/ 子目录下，这里逐一探测并记录命中项。
fn resolve_resource_base(resource_dir: &Path, log_file: &mut File) -> Option<PathBuf> {
    const CANDIDATES: [&str; 5] = [
        "_up_/dist-tauri",
        "resources/_up_/dist-tauri",
        "resources/dist-tauri",
        "dist-tauri",
        "resources",
    ];
    for rel in CANDIDATES {
        let p = resource_dir.join(rel);
        if p.join("backend.tar").exists() || p.join("node").join("node.exe").exists() {
            append_log(log_file, &format!("[backend] 资源基础目录: {}", p.display()));
            return Some(p);
        }
    }
    // 开发兜底：cwd/dist-tauri
    if let Ok(cwd) = std::env::current_dir() {
        let p = cwd.join("dist-tauri");
        if p.join("backend.tar").exists() {
            append_log(log_file, &format!("[backend] 资源基础目录(cwd 兜底): {}", p.display()));
            return Some(p);
        }
    }
    None
}

/// 将随包分发的 backend.tar 解包到 runtime 目录（幂等，按归档大小做变更检测）。
/// 返回解包后的 dist 目录。
fn ensure_backend_extracted(
    resource_base: &Path,
    runtime_dir: &Path,
    log_file: &mut File,
) -> Result<PathBuf, String> {
    let tar_path = resource_base.join("backend.tar");
    // backend.tar 的根目录为 dist/（与生产布局一致），解包后运行时根为 runtime/dist
    let dist_root = runtime_dir.join("dist");
    let server_main = dist_root.join("server").join("main.js");

    // 兼容旧布局：资源里直接放 dist/（无 tar 时）
    if !tar_path.exists() {
        let legacy = resource_base.join("dist").join("server").join("main.js");
        if legacy.exists() {
            append_log(log_file, "[backend] 使用资源目录内的 dist/（旧布局）");
            return Ok(resource_base.join("dist"));
        }
        return Err(format!(
            "未找到 {}（请先执行 npm run tauri:prepare）",
            tar_path.display()
        ));
    }

    // 变更标记：FNV-1a 全文哈希（曾出现新旧 tar 大小完全相同导致缓存误命中）
    let tar_hash = file_fnv1a(&tar_path);
    let marker_path = runtime_dir.join(".backend.marker");
    let expected_marker = format!("fnv1a:{tar_hash:x}");
    let marker_ok = std::fs::read_to_string(&marker_path)
        .ok()
        .map(|s| s.trim() == expected_marker)
        .unwrap_or(false);

    // 缓存命中除标记匹配外，还需关键文件完整性哨兵（防止被中断的部分解包被误判为完整）
    let sentinels_ok = [
        dist_root.join("server").join("main.js"),
        dist_root.join("node_modules").join("@nestjs").join("core").join("package.json"),
        dist_root.join("db").join("init.sql"),
        dist_root.join("init-db.js"),
    ]
    .iter()
    .all(|p| p.exists());

    if server_main.exists() && marker_ok && sentinels_ok {
        append_log(log_file, "[backend] 后端运行时已就绪（缓存命中）");
        return Ok(dist_root);
    }

    append_log(
        log_file,
        &format!("[backend] 首次解包后端运行时 -> {}", runtime_dir.display()),
    );
    let _ = std::fs::remove_dir_all(runtime_dir);
    std::fs::create_dir_all(runtime_dir).map_err(|e| format!("创建运行目录失败: {e}"))?;

    let file = File::open(&tar_path).map_err(|e| format!("打开 backend.tar 失败: {e}"))?;
    let mut archive = tar::Archive::new(file);
    archive
        .unpack(runtime_dir)
        .map_err(|e| format!("解包 backend.tar 失败: {e}"))?;

    let _ = std::fs::write(&marker_path, expected_marker);
    append_log(log_file, "[backend] 解包完成");
    Ok(dist_root)
}

/// FNV-1a 64 位文件哈希（流式读取，用于 backend.tar 变更检测）
fn file_fnv1a(path: &Path) -> u64 {
    use std::io::Read;
    let mut hash: u64 = 0xcbf29ce484222325;
    if let Ok(mut f) = File::open(path) {
        let mut buf = [0u8; 65536];
        loop {
            match f.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    for &b in &buf[..n] {
                        hash ^= b as u64;
                        hash = hash.wrapping_mul(0x100000001b3);
                    }
                }
                Err(_) => break,
            }
        }
    }
    hash
}

/// 启动内置后端（先跑一次幂等 DB 初始化，再启动 main.js）
fn start_backend(
    resource_base: &Path,
    dist_dir: &Path,
    port: u16,
    log_file: &mut File,
) -> std::io::Result<Child> {
    // 1. 定位 node 运行时
    let bundled_node = resource_base.join("node").join("node.exe");
    let node: PathBuf = if bundled_node.exists() {
        bundled_node
    } else if let Ok(n) = std::env::var("NODE") {
        PathBuf::from(n)
    } else {
        PathBuf::from("node") // dev：使用 PATH 中的 node
    };

    let server_main = dist_dir.join("server").join("main.js");
    if !server_main.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("后端入口不存在: {}", server_main.display()),
        ));
    }

    // 2. 用户级环境覆盖（%APPDATA%/SocialManager/env.local，可配置 SUDA_DATABASE_URL 等）
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let override_env = if appdata.is_empty() {
        Vec::new()
    } else {
        parse_env_file(&Path::new(&appdata).join("SocialManager").join("env.local"))
    };
    for (k, _v) in &override_env {
        append_log(log_file, &format!("[env] 应用用户覆盖配置 {k}"));
    }

    // 3. 幂等数据库初始化（缺失表时按 db/init.sql 建表，IF NOT EXISTS 可重复执行）
    let init_script = dist_dir.join("init-db.js");
    if init_script.exists() {
        append_log(log_file, "[backend] 执行数据库初始化 (init-db.js)...");
        let init_out = log_file.try_clone();
        let init_err = log_file.try_clone();
        let mut init_cmd = Command::new(&node);
        init_cmd
            .arg(&init_script)
            .current_dir(dist_dir)
            .env("NODE_ENV", "production");
        if let (Ok(out), Ok(err)) = (init_out, init_err) {
            init_cmd.stdout(Stdio::from(out)).stderr(Stdio::from(err));
        }
        for (k, v) in &override_env {
            init_cmd.env(k, v);
        }
        if let Ok(mut init_child) = init_cmd.spawn() {
            let deadline = Instant::now() + DB_INIT_TIMEOUT;
            loop {
                if let Some(status) = init_child.try_wait().unwrap_or(None) {
                    append_log(
                        log_file,
                        &format!("[backend] 数据库初始化结束，退出码: {status}"),
                    );
                    break;
                }
                if Instant::now() > deadline {
                    let _ = init_child.kill();
                    append_log(log_file, "[backend] 数据库初始化超时，已终止（后端随后将自行报错）");
                    break;
                }
                thread::sleep(Duration::from_millis(300));
            }
        } else {
            append_log(log_file, "[backend] init-db.js 启动失败，跳过（后端随后将自行报错）");
        }
    }

    // 4. 启动 NestJS 后端
    append_log(
        log_file,
        &format!(
            "[backend] 启动后端: {} (port={port}, cwd={})",
            node.display(),
            dist_dir.display()
        ),
    );
    let stdout_log = log_file.try_clone()?;
    let stderr_log = log_file.try_clone()?;
    let mut cmd = Command::new(&node);
    cmd.arg(&server_main)
        .current_dir(dist_dir)
        .env("NODE_ENV", "production")
        .env("SERVER_HOST", "127.0.0.1")
        .env("SERVER_PORT", port.to_string())
        .env("CLIENT_BASE_PATH", "")
        // 平台核心要求基础域名（本应用不调用平台 API，占位即可；可用 env.local 覆盖）
        .env("FORCE_AUTHN_INNERAPI_DOMAIN", "http://127.0.0.1")
        .env("LOG_DIR", appdata_log_dir().unwrap_or_default())
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log));
    for (k, v) in &override_env {
        cmd.env(k, v);
    }
    cmd.spawn()
}

/// 打开外部链接：用系统默认浏览器打开（Windows cmd start，无需前端权限）
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("仅支持 http/https 链接".into());
    }
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &url])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![open_external])
        .setup(|app| {
            let app_data = appdata_root().unwrap_or_else(|| PathBuf::from("."));
            let _ = std::fs::create_dir_all(&app_data);
            let log_dir = appdata_log_dir().unwrap_or_else(|| PathBuf::from("."));
            let log_path = log_dir.join("backend.log");
            let mut log_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .unwrap_or_else(|_| File::create(&log_path).expect("无法创建日志文件"));

            append_log(&mut log_file, "========== 客户端启动 ==========");
            append_log(&mut log_file, &format!("应用数据目录: {}", app_data.display()));

            // 定位资源基础目录
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|e| format!("无法定位资源目录: {e}"))?;
            append_log(&mut log_file, &format!("[backend] 资源目录: {}", resource_dir.display()));
            let Some(resource_base) = resolve_resource_base(&resource_dir, &mut log_file) else {
                append_log(&mut log_file, "[fatal] 未找到打包资源（backend.tar / node.exe）");
                return Err("未找到打包资源，请先执行 npm run tauri:prepare".into());
            };

            // 解包后端运行时
            let runtime_dir = app_data.join("runtime");
            let dist_dir = ensure_backend_extracted(&resource_base, &runtime_dir, &mut log_file)?;

            // 找空闲端口：优先固定端口（小红书等平台回调地址需在后台登记固定 redirectUri，
            // 端口必须稳定）；被占用则回退随机端口。
            const PREFERRED_PORT: u16 = 55725;
            let port = if !port_open(PREFERRED_PORT) {
                PREFERRED_PORT
            } else {
                find_free_port().unwrap_or(0)
            };
            if port == 0 {
                append_log(&mut log_file, "[fatal] 无法分配空闲端口");
                return Err("无法分配空闲端口".into());
            }
            append_log(&mut log_file, &format!("[backend] 使用端口: {port}"));

            // 启动后端
            let mut child = match start_backend(&resource_base, &dist_dir, port, &mut log_file) {
                Ok(child) => child,
                Err(e) => {
                    append_log(&mut log_file, &format!("[fatal] 后端启动失败: {e}"));
                    return Err(format!("后端启动失败: {e}").into());
                }
            };

            // 轮询就绪
            let backend_url = format!("http://127.0.0.1:{port}/");
            let deadline = Instant::now() + BACKEND_READY_TIMEOUT;
            let mut ready = false;
            loop {
                if port_open(port) {
                    ready = true;
                    break;
                }
                if let Some(status) = child.try_wait().unwrap_or(None) {
                    append_log(
                        &mut log_file,
                        &format!(
                            "[fatal] 后端进程提前退出，退出码: {status}（请检查 {} 中的 backend.log）",
                            log_dir.display()
                        ),
                    );
                    break;
                }
                if Instant::now() > deadline {
                    append_log(&mut log_file, "[fatal] 等待后端就绪超时");
                    break;
                }
                thread::sleep(Duration::from_millis(250));
            }

            if !ready {
                append_log(
                    &mut log_file,
                    "后端未就绪，仍将打开窗口（页面将显示连接失败）；常见原因：SUDA_DATABASE_URL 未配置或 PostgreSQL 未启动。",
                );
            } else {
                append_log(&mut log_file, &format!("[backend] 就绪: {backend_url}"));
            }

            // 管理子进程生命周期
            app.manage(BackendState(Mutex::new(Some(child))));

            // 创建主窗口
            let url: tauri::Url = backend_url.parse().expect("无效的 URL");
            WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::External(url))
                .title("自媒体多平台管理")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                // 关闭 Tauri 文件拖放拦截，让 HTML5 drag/drop 直达页面（发布编辑页拖拽上传依赖）
                .disable_drag_drop_handler()
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("构建 Tauri 应用失败")
        .run(|app_handle: &tauri::AppHandle<tauri::Wry>, event: tauri::RunEvent| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(state) = app_handle.try_state::<BackendState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
