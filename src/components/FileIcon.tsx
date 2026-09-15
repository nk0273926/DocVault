import { FileText, Image, FileType, FileSpreadsheet, Presentation, Archive, File as FileIcon } from 'lucide-react';

const ICON_MAP: Record<string, typeof FileText> = {
  pdf: FileText,
  image: Image,
  word: FileType,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: Archive,
  text: FileText,
  file: FileIcon,
};

const COLOR_MAP: Record<string, string> = {
  pdf: 'bg-red-100 text-red-600',
  image: 'bg-purple-100 text-purple-600',
  word: 'bg-blue-100 text-blue-600',
  sheet: 'bg-emerald-100 text-emerald-600',
  slides: 'bg-orange-100 text-orange-600',
  archive: 'bg-amber-100 text-amber-600',
  text: 'bg-slate-100 text-slate-600',
  file: 'bg-slate-100 text-slate-500',
};

export function FileIconDisplay({ type, size = 36 }: { type: string; size?: number }) {
  const key = getIconKey(type);
  const Icon = ICON_MAP[key] || FileIcon;
  const color = COLOR_MAP[key] || 'bg-slate-100 text-slate-500';

  return (
    <div
      className={`rounded-lg flex items-center justify-center shrink-0 ${color}`}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.5} />
    </div>
  );
}

function getIconKey(type: string): string {
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('image')) return 'image';
  if (type.includes('word') || type.includes('document')) return 'word';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return 'sheet';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'slides';
  if (type.includes('zip') || type.includes('compressed')) return 'archive';
  if (type.includes('text')) return 'text';
  return 'file';
}
