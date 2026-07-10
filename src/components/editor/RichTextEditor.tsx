'use client'

import { CKEditor } from '@ckeditor/ckeditor5-react'
import {
  AccessibilityHelp,
  Alignment,
  Autoformat,
  BlockQuote,
  Bold,
  ClassicEditor,
  Code,
  CodeBlock,
  Essentials,
  FindAndReplace,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  GeneralHtmlSupport,
  Heading,
  Highlight,
  HorizontalLine,
  Indent,
  IndentBlock,
  Italic,
  Link,
  List,
  ListProperties,
  Paragraph,
  PasteFromOffice,
  RemoveFormat,
  SelectAll,
  ShowBlocks,
  SourceEditing,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  TextPartLanguage,
  Underline,
  Undo,
} from 'ckeditor5'

type Props = {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const editorConfig = {
  licenseKey: 'GPL',
  plugins: [
    AccessibilityHelp,
    Alignment,
    Autoformat,
    BlockQuote,
    Bold,
    Code,
    CodeBlock,
    Essentials,
    FindAndReplace,
    FontBackgroundColor,
    FontColor,
    FontFamily,
    FontSize,
    GeneralHtmlSupport,
    Heading,
    Highlight,
    HorizontalLine,
    Indent,
    IndentBlock,
    Italic,
    Link,
    List,
    ListProperties,
    Paragraph,
    PasteFromOffice,
    RemoveFormat,
    SelectAll,
    ShowBlocks,
    SourceEditing,
    SpecialCharacters,
    SpecialCharactersEssentials,
    Strikethrough,
    Subscript,
    Superscript,
    Table,
    TableCaption,
    TableCellProperties,
    TableColumnResize,
    TableProperties,
    TableToolbar,
    TextPartLanguage,
    Underline,
    Undo,
  ],
  toolbar: {
    items: [
      'undo',
      'redo',
      '|',
      'heading',
      '|',
      'fontSize',
      'fontFamily',
      'fontColor',
      'fontBackgroundColor',
      '|',
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'subscript',
      'superscript',
      'removeFormat',
      '|',
      'alignment',
      '|',
      'bulletedList',
      'numberedList',
      'outdent',
      'indent',
      '|',
      'link',
      'blockQuote',
      'insertTable',
      'horizontalLine',
      'specialCharacters',
      'highlight',
      'code',
      'codeBlock',
      '|',
      'showBlocks',
      'findAndReplace',
      'sourceEditing',
      'selectAll',
      'accessibilityHelp',
    ],
    shouldNotGroupWhenFull: true,
  },
  table: {
    contentToolbar: [
      'tableColumn',
      'tableRow',
      'mergeTableCells',
      'tableProperties',
      'tableCellProperties',
    ],
  },
  list: {
    properties: {
      styles: true,
      startIndex: true,
      reversed: true,
    },
  },
  heading: {
    options: [
      { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
      { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
      { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
      { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
      { model: 'heading4', view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
    ],
  },
  placeholder: 'Enter your question here...',
}

export default function RichTextEditor({ label, value, onChange, placeholder }: Props) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}
      <div className="ckeditor-shell overflow-hidden rounded-xl border border-gray-300 bg-white">
        <CKEditor
          editor={ClassicEditor}
          config={{
            ...editorConfig,
            placeholder: placeholder ?? editorConfig.placeholder,
          }}
          data={value}
          onChange={(_, editor) => {
            onChange(editor.getData())
          }}
        />
      </div>
    </div>
  )
}
