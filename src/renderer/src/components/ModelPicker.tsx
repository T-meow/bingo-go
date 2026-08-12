import { AutoComplete, Spin } from 'antd'

export function ModelPicker({ value, models, loading = false, disabled = false, ariaLabel = '模型', placeholder = '选择或输入模型', className, size, variant, onChange }: {
  value: string
  models: string[]
  loading?: boolean
  disabled?: boolean
  ariaLabel?: string
  placeholder?: string
  className?: string
  size?: 'small' | 'middle' | 'large'
  variant?: 'outlined' | 'borderless' | 'filled' | 'underlined'
  onChange: (value: string) => void
}): React.JSX.Element {
  const options = [...new Set([value, ...models].map((model) => model.trim()).filter(Boolean))]
    .map((model) => ({ value: model, label: model }))

  return <AutoComplete
    aria-label={ariaLabel}
    className={className}
    value={value}
    options={options}
    disabled={disabled}
    size={size}
    variant={variant}
    allowClear
    placeholder={placeholder}
    popupMatchSelectWidth={320}
    notFoundContent={loading ? <Spin size="small" /> : '输入准确的模型 ID'}
    filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
    onChange={onChange}
  />
}
