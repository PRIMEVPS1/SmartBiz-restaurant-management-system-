// src/components/Logo.jsx — SmartBiz logo mark (blue rounded square + white S)
export default function LogoMark({ size = 36 }) {
  return (
    <svg className="sbz-mark" width={size} height={size} viewBox="0 0 64 64" aria-label="SmartBiz">
      <rect width="64" height="64" rx="16" fill="#29b6f6" />
      <text x="32" y="45" textAnchor="middle" fontFamily="Inter, Arial, sans-serif"
            fontWeight="700" fontSize="38" fill="#fff">S</text>
    </svg>
  )
}
