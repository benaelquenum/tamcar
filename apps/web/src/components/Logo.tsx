export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 96"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="TamCar"
    >
      <title>TamCar</title>
      <g fontFamily="Inter, system-ui, sans-serif" fontWeight={800}>
        <text x={20} y={66} fontSize={52} fill="#EA5D18">
          Tam
        </text>
        <text x={145} y={66} fontSize={52} fill="#1F1712">
          Car
        </text>
        <circle cx={292} cy={30} r={6} fill="#F4C430" />
      </g>
    </svg>
  );
}
