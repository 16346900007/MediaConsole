import type { SyncData, VideoData, FileData } from '../../fill-types';



/**
 * 源自 MultiPost-Extension (Apache-2.0) https://github.com/leaper-one/MultiPost-Extension
 * 提取自 multipost-core，仅适配 MediaConsole 现有 7 平台；填表后由人工点击发布。
 */

export async function VideoBilibili(data: SyncData) {
  function waitForElement(selector: string, timeout = 10000): Promise<Element> {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          observer.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms`));
      }, timeout);
    });
  }

  async function waitForElementOptional(selector: string, timeout = 10000): Promise<Element | null> {
    return waitForElement(selector, timeout).catch(() => null);
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * B站新版（创作中心 cover-editor）封面入口：
   * 1) 已有封面：cover-main 下含"更换封面"文本的元素
   * 2) 空封面：cover-empty-pill / cover-slot / cover-empty（"+添加封面"）
   */
  function findCoverEntry(): { element: HTMLElement; isFallbackEntry: boolean } | null {
    const existingEntry = document.querySelector("div.cover-main-img > div.img") as HTMLElement | null;
    if (existingEntry) return { element: existingEntry, isFallbackEntry: false };

    const coverMain = document.querySelector("div.cover-main") as HTMLElement | null;
    const fallbackEntry = Array.from(coverMain?.querySelectorAll<HTMLElement>("span, div") ?? []).find(
      (span) => (span.textContent?.includes("更换封面") || span.textContent?.includes("封面设置")) && span.children.length === 0,
    );
    if (fallbackEntry) return { element: fallbackEntry as HTMLElement, isFallbackEntry: true };

    const emptyEntry = document.querySelector(
      "div.cover-empty-pill, div.cover-slot, div.cover-empty, div.cover-module-main",
    ) as HTMLElement | null;
    if (emptyEntry) return { element: emptyEntry, isFallbackEntry: true };

    return null;
  }

  function findDoneButton(): HTMLElement | null {
    const footerButton = Array.from(document.querySelectorAll<HTMLElement>("div.cover-select-footer-pick button")).find(
      (btn) => btn.textContent?.trim() === "完成",
    );
    if (footerButton) return footerButton;

    // B站新版封面制作弹窗（cover-editor）底部按钮区：div.cover-editor-button（含"取消 完成"）
    const editorButton = Array.from(document.querySelectorAll<HTMLElement>("div.cover-editor-button, button, span")).find(
      (btn) => (btn.textContent?.includes("完成") ?? false) && (btn.textContent?.trim().length ?? 99) < 12,
    );
    if (editorButton) return editorButton;

    return (
      Array.from(document.querySelectorAll<HTMLElement>("div.submit")).find(
        (button) => button.textContent?.trim() === "完成",
      ) ?? null
    );
  }

  /**
   * B站新版创作声明是占位式下拉：先点击"请选择符合您视频内容的创作声明"展开，
   * 再从弹出项中选择"自制"/"转载"（纯文本驱动，兼容结构变化）。
   */
  function applyOriginalDeclaration(isOriginal: boolean): void {
    const targetText = isOriginal ? "自制" : "转载";

    // 若已显式选中"自制/转载"，视为已填（新版页面可能默认选中）
    const alreadySelected = Array.from(document.querySelectorAll<HTMLElement>("span, div, li")).find(
      (el) =>
        el.children.length === 0 &&
        /(自制原创|转载非原创|自制|转载)/.test(el.textContent ?? "") &&
        (el.closest('[class*="check" i], [class*="radio" i], [class*="selected" i], [class*="active" i]') !== null),
    );
    if (alreadySelected) {
      console.log("创作声明已选中（默认/已有），跳过: " + (alreadySelected.textContent || "").trim().slice(0, 12));
      return;
    }

    const placeholder = Array.from(document.querySelectorAll<HTMLElement>("span, div")).find(
      (el) =>
        el.children.length === 0 &&
        (el.textContent?.includes("请选择符合您视频内容的创作声明") ||
          el.textContent?.includes("创作声明") ||
          el.textContent?.includes("原创声明")),
    );
    if (placeholder) {
      placeholder.click();
      console.log("已点击创作声明占位，展开下拉");
    } else {
      console.log("未找到创作声明占位文本（可能已默认选择）");
    }

    // 等待下拉出现后选择目标项
    setTimeout(() => {
      const option = Array.from(document.querySelectorAll<HTMLElement>("span, div, li")).find(
        (el) => el.children.length === 0 && (el.textContent?.trim() === targetText || el.textContent?.includes(targetText)),
      );
      if (option) {
        option.click();
        console.log(isOriginal ? "已选择自制原创声明" : "已选择转载原创声明");
      } else {
        console.log("未找到原创声明选项: " + targetText);
      }
    }, 1200);
  }

  async function uploadCover(cover: FileData): Promise<boolean> {
    console.log("开始上传封面", cover);
    // 封面可独立于视频上传：直接打开封面弹窗即可
    await waitForElementOptional("div.cover-empty-pill, div.cover-empty, div.cover-slot, div.cover-main");
    const coverEntry = findCoverEntry();
    if (!coverEntry) {
      console.log("未找到封面上传按钮");
      return false;
    }

    coverEntry.element.click();
    await sleep(2500);

    // 定位封面弹窗内的文件输入框：从"上传封面/拖拽图片"文本元素沿祖先链查找，
    // 避免点击上传区（会弹系统文件对话框）。找不到时回退到 accept 含 image 的可见 input。
    const uploadZone = Array.from(document.querySelectorAll<HTMLElement>("div, span")).find(
      (el) =>
        el.children.length === 0 &&
        (el.textContent?.trim() === "上传封面" || el.textContent?.includes("拖拽图片或点击上传")),
    );
    let fileInput: HTMLInputElement | undefined;
    if (uploadZone) {
      let container: HTMLElement | null = uploadZone.parentElement;
      for (let i = 0; i < 6 && container; i++) {
        const found = container.querySelector<HTMLInputElement>('input[type="file"]');
        if (found) {
          fileInput = found;
          break;
        }
        container = container.parentElement;
      }
    }
    if (!fileInput) {
      const allInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
      fileInput = allInputs.find(
        (inp) => inp.accept && /image/i.test(inp.accept) && inp.offsetParent !== null,
      ) as HTMLInputElement | undefined;
    }

    if (!fileInput) {
      console.log("未找到封面上传的文件输入框");
      return false;
    }

    const dataTransfer = new DataTransfer();
    if (cover.type && !cover.type.includes("image/")) {
      console.log("封面文件类型不正确");
      return false;
    }

    const response = await fetch(cover.url);
    const blob = await response.blob();
    const coverFile = new File([blob], cover.name, { type: cover.type || "image/png" });
    dataTransfer.items.add(coverFile);

    if (dataTransfer.files.length === 0) {
      return false;
    }

    // React 受控组件需用原生 setter 写入 files 才能触发上传
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "files",
    )?.set;
    if (setter) {
      setter.call(fileInput, dataTransfer.files);
    } else {
      fileInput.files = dataTransfer.files;
    }
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    console.log("封面文件上传操作已触发");
    // 等封面上传完成并渲染（图片预览出现）后再点完成
    await sleep(5000);

    const doneButton = findDoneButton();

    if (doneButton) {
      (doneButton as HTMLElement).click();
      console.log("封面上传完成并点击完成");
      await sleep(1500);
      return true;
    }
    console.log('未找到"完成"按钮');
    return false;
  }

  async function uploadVideo(file: File): Promise<boolean> {
    const fileInput = (await waitForElementOptional('input[type="file"]')) as HTMLInputElement | null;
    if (!fileInput) {
      console.log("未找到视频上传文件输入框");
      return false;
    }

    // 创建一个新的 File 对象，因为某些浏览器可能不允许直接设置 fileInput.files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // 触发 change 事件
    const changeEvent = new Event("change", { bubbles: true });
    fileInput.dispatchEvent(changeEvent);

    console.log("视频上传事件已触发");
    return true;
  }

  async function waitForUploadCompletion(timeout = 600000): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const spans = document.querySelectorAll("span");
        const uploadCompleteElement = Array.from(spans).find((span) => span.textContent?.includes("上传完成"));
        if (uploadCompleteElement) {
          clearInterval(checkInterval);
          console.log("视频上传完成");
          resolve();
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error("视频上传超时"));
      }, timeout);
    });
  }

  try {
    const { content, video, title, tags, cover, horizontalCover, description, original } = data.data as VideoData;

    // 视频简介优先使用 description（独立字段），未提供时回退到 content
    const videoDescription = description ?? content;
    // 原创声明:用户未明确指定时默认为原创(B 站投稿默认勾选)
    const isOriginal = original !== false;

    // 处理视频上传
    if (video) {
      await waitForElementOptional('input[type="file"]');
      await sleep(1000);

      const response = await fetch(video.url);
      const blob = await response.arrayBuffer();
      const extension = video.name.split(".").pop() || "mp4";
      const videoFilename = `${title}.${extension}`;
      const videoFile = new File([blob], videoFilename, { type: video.type });

      console.log(`视频文件: ${videoFile.name} ${videoFile.type} ${videoFile.size}`);

      const videoUploadTriggered = await uploadVideo(videoFile);
      if (!videoUploadTriggered) return;
      console.log("视频上传已初始化");

      // 不等待视频上传完成（大文件 1-2 分钟）：封面/标题/声明/标签在上传过程中即可填写，
      // 上传由页面后台继续，人工点发布时页面自会校验。
      await sleep(3000);
    } else {
      console.error("没有视频文件");
      return;
    }

    // Handle title input.
    const titleInput =
      ((await waitForElementOptional('input[maxlength="80"][type="text"]')) as HTMLInputElement | null) ||
      ((await waitForElementOptional('input.input-val[type="text"][maxlength="80"]', 3000)) as HTMLInputElement | null);
    if (title) {
      if (titleInput) {
        titleInput.focus();
        titleInput.value = title;
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
        titleInput.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("标题已输入:", title);
      } else {
        console.log("未找到标题输入框");
      }
    }

    // 等待简介编辑器出现并输入内容
    const editor = (await waitForElementOptional('div.ql-editor[contenteditable="true"]')) as HTMLDivElement | null;
    if (editor) {
      editor.innerHTML = videoDescription || "";
      console.log("简介已输入:", videoDescription);
    } else {
      console.log("未找到简介编辑器");
    }

    // Original declaration defaults to self-made; explicit false cancels it when the checkbox exists.
    applyOriginalDeclaration(isOriginal);

    await sleep(3000);

    // Handle tags best-effort.
    try {
      const existingTags = document.querySelectorAll("div.tag-pre-wrp > div.label-item-v2-container");
      console.log(`发现 ${existingTags.length} 个已有标签，准备清除...`);
      for (let i = 0; i < existingTags.length; i++) {
        const tag = existingTags[i] as HTMLElement;
        const closeButton = tag.querySelector(".label-item-v2-close");
        if (closeButton) {
          (closeButton as HTMLElement).click();
          await sleep(400);
        }
      }

      if (!tags || tags.length === 0) {
        console.log("未指定标签，选择热门标签...");
        const hotTags = document.querySelectorAll(".hot-tag-item");
        if (hotTags.length > 0) {
          for (let i = 0; i < 3 && i < hotTags.length; i++) {
            const tag = hotTags[i] as HTMLElement;
            tag.click();
            await sleep(1000);
          }
        }
      } else {
        console.log("添加指定标签...");
        const tagInput = document.querySelector('input[placeholder="按回车键Enter创建标签"]') as HTMLInputElement;
        if (tagInput) {
          for (const tag of tags.slice(0, 10)) {
            tagInput.value = tag;
            const enterEvent = new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
            });
            tagInput.dispatchEvent(enterEvent);
            await sleep(1000);
          }
        }
      }
    } catch (error) {
      console.warn("Bilibili 标签处理失败，继续发布流程:", error);
    }

    // Upload one cover best-effort.
    const coverToUpload = horizontalCover || cover;
    if (coverToUpload) {
      await uploadCover(coverToUpload).catch((error) => {
        console.warn("Bilibili 封面上传失败，继续发布流程:", error);
        return false;
      });
    }

    // 等待标签和封面处理完成
    await sleep(5000);

    // 如果需要自动发布
    if (data.isAutoPublish) {
      const submitButton = document.querySelector("span.submit-add") as HTMLElement;
      if (submitButton) {
        console.log("点击发布按钮");
        submitButton.click();
      } else {
        console.log('未找到"发送"按钮');
      }
    }
  } catch (error) {
    console.error("BilibiliVideo 发布过程中出错:", error);
  }
}

