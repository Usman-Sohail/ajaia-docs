import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react'

interface ToolbarProps {
  editor: Editor
  disabled?: boolean
}

interface ToolButtonProps {
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

function ToolButton({ icon: Icon, label, shortcut, active, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      // Keep the editor selection when clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      className={`flex size-8 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-accent/10 text-accent' : 'text-ink/80 hover:bg-black/5'
      }`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

const Divider = () => <span className="mx-1 h-5 w-px bg-line" aria-hidden />

export function Toolbar({ editor, disabled }: ToolbarProps) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()
  const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      <ToolButton icon={Undo2} label="Undo" shortcut={`${mod}Z`} disabled={disabled || !s.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton icon={Redo2} label="Redo" shortcut={`${mod}Shift+Z`} disabled={disabled || !s.canRedo} onClick={() => chain().redo().run()} />
      <Divider />
      <ToolButton icon={Heading1} label="Heading 1" active={s.h1} disabled={disabled} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <ToolButton icon={Heading2} label="Heading 2" active={s.h2} disabled={disabled} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon={Heading3} label="Heading 3" active={s.h3} disabled={disabled} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider />
      <ToolButton icon={Bold} label="Bold" shortcut={`${mod}B`} active={s.bold} disabled={disabled} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic" shortcut={`${mod}I`} active={s.italic} disabled={disabled} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon={Underline} label="Underline" shortcut={`${mod}U`} active={s.underline} disabled={disabled} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton icon={Strikethrough} label="Strikethrough" active={s.strike} disabled={disabled} onClick={() => chain().toggleStrike().run()} />
      <ToolButton icon={Code} label="Inline code" active={s.code} disabled={disabled} onClick={() => chain().toggleCode().run()} />
      <Divider />
      <ToolButton icon={List} label="Bulleted list" active={s.bullet} disabled={disabled} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Numbered list" active={s.ordered} disabled={disabled} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={Quote} label="Quote" active={s.quote} disabled={disabled} onClick={() => chain().toggleBlockquote().run()} />
    </div>
  )
}
