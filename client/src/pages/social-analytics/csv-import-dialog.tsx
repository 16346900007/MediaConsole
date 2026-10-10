import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileUp, UploadCloud } from 'lucide-react';
import type { MetricBatchResponse, MetricInput } from '@shared/api.interface';
import { importMetrics } from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resolveErrorMessage } from './helpers';

const CSV_COLUMNS = [
  'account_id',
  'date',
  'views',
  'likes',
  'comments',
  'shares',
  'followers_delta',
];

const TEMPLATE_BODY = `${CSV_COLUMNS.join(',')}\n00000000-0000-0000-0000-000000000001,2026-10-01,1200,150,30,12,25`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_PATTERN = /^\d+$/;

interface RowError {
  row: number;
  message: string;
}

interface ParsedCsv {
  fileName: string;
  items: MetricInput[];
  errors: RowError[];
}

/** 简单 CSV 解析：按逗号 split，Trim 空白，行级错误逐条记录 */
function parseCsvText(text: string): { items: MetricInput[]; errors: RowError[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);
  const items: MetricInput[] = [];
  const errors: RowError[] = [];

  let firstDataRow = 0;
  if (lines.length > 0) {
    const header = lines[0]
      .split(',')
      .map((cell: string) => cell.trim().toLowerCase());
    if (header.join(',') === CSV_COLUMNS.join(',')) firstDataRow = 1;
  }

  for (let index = firstDataRow; index < lines.length; index += 1) {
    const row = index - firstDataRow + 1;
    const cells = lines[index]
      .split(',')
      .map((cell: string) => cell.trim());
    if (cells.length < CSV_COLUMNS.length) {
      errors.push({
        row,
        message: `列数不足，应为 ${CSV_COLUMNS.length} 列`,
      });
      continue;
    }
    const [accountId, date, ...numericCells] = cells;
    if (accountId.length === 0) {
      errors.push({ row, message: '账号 ID 不能为空' });
      continue;
    }
    if (!DATE_PATTERN.test(date)) {
      errors.push({ row, message: '日期格式应为 YYYY-MM-DD' });
      continue;
    }
    const values: number[] = [];
    let numericError: string | null = null;
    for (const cell of numericCells.slice(0, 5)) {
      if (cell === '') {
        values.push(0);
        continue;
      }
      if (!INTEGER_PATTERN.test(cell)) {
        numericError = '数值必须为非负整数';
        break;
      }
      values.push(Number(cell));
    }
    if (numericError !== null) {
      errors.push({ row, message: numericError });
      continue;
    }
    items.push({
      accountId,
      date,
      views: values[0],
      likes: values[1],
      comments: values[2],
      shares: values[3],
      followersDelta: values[4],
    });
  }
  return { items, errors };
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** CSV 批量导入 Dialog：模板下载 + 文件选择 + 前端解析 + 结果逐行展示 */
const CsvImportDialog: React.FC<CsvImportDialogProps> = ({
  open,
  onOpenChange,
  onImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [result, setResult] = useState<MetricBatchResponse | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      setParsed(null);
      setResult(null);
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const { items, errors } = parseCsvText(text);
      setParsed({ fileName: file.name, items, errors });
    };
    reader.onerror = () => {
      toast.error('文件读取失败', { description: '请重试或更换文件' });
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const blob = new Blob([`\uFEFF${TEMPLATE_BODY}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'metrics-import-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!parsed) return;
    if (parsed.items.length === 0) {
      toast.error('没有可导入的有效数据行', {
        description: '请根据模板检查文件内容',
      });
      return;
    }
    setSubmitting(true);
    try {
      const response = await importMetrics(parsed.items);
      setResult(response);
      if (response.errors.length === 0) {
        toast.success(`成功导入 ${response.succeeded} 条数据`);
      } else {
        toast.warning(
          `成功 ${response.succeeded} 条，失败 ${response.errors.length} 条`,
        );
      }
      onImported();
    } catch (error) {
      toast.error('导入失败', { description: resolveErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const allErrors: RowError[] = [
    ...(parsed?.errors ?? []),
    ...(result?.errors ?? []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-bold tracking-tight text-[rgb(26_26_26)]">
            导入 CSV
          </DialogTitle>
          <DialogDescription className="text-[12px] font-medium text-slate-600">
            列头固定为{' '}
            <code className="font-mono text-[12px] font-bold text-[#0033A0]">
              {CSV_COLUMNS.join(',')}
            </code>
            ，数值留空按 0 处理。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={downloadTemplate}
            >
              <Download className="size-4" />
              下载模板
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="size-4" />
              选择 CSV 文件
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {parsed && (
            <p className="text-[12px] font-medium text-slate-600">
              已选择{' '}
              <span className="font-bold text-[rgb(26_26_26)]">{parsed.fileName}</span>
              ，解析出 {parsed.items.length} 条有效数据
              {parsed.errors.length > 0
                ? `，${parsed.errors.length} 条解析失败`
                : ''}
            </p>
          )}

          <Button
            type="button"
            onClick={() => void handleImport()}
            disabled={!parsed || parsed.items.length === 0 || submitting}
            className="rounded-none bg-[#0033A0] text-white hover:bg-[#004B93]"
          >
            <UploadCloud className="size-4" />
            {submitting ? '导入中…' : '开始导入'}
          </Button>

          {allErrors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-none border border-dashed border-[#E2E8F0] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#EF4444]">
                Failed Rows
              </p>
              <ul className="mt-2 space-y-1.5">
                {allErrors.map((item: RowError, index: number) => (
                  <li
                    key={`${item.row}-${index}`}
                    className="text-sm text-[#EF4444]"
                  >
                    第 {item.row} 行：{item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result && (
            <p className="text-[12px] font-bold text-[rgb(26_26_26)]">
              导入完成：成功 {result.succeeded} 条
              {result.errors.length > 0
                ? `，失败 ${result.errors.length} 条`
                : ''}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CsvImportDialog;
