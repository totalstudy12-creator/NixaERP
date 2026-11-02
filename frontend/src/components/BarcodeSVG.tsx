import React from 'react';

// Code 128 Pattern Table (indices 0 to 106)
// Each 6-digit string represents the widths of alternating bars and spaces.
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'                                 // 100-106 (106 is STOP with 7 digits)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export interface BarcodeSVGProps {
  value: string;
  width?: number; // module width in px
  height?: number; // bar height in px
  fontSize?: number;
  showText?: boolean;
  className?: string;
}

export function BarcodeSVG({
  value,
  width = 2,
  height = 50,
  fontSize = 12,
  showText = true,
  className = '',
}: BarcodeSVGProps) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Calculate Code 128 Set B values
  const chars = value.split('');
  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < chars.length; i++) {
    const codePoint = chars[i].charCodeAt(0);
    const code = codePoint >= 32 && codePoint <= 126 ? codePoint - 32 : 0;
    codes.push(code);
    checksum += code * (i + 1);
  }

  const checkCode = checksum % 103;
  codes.push(checkCode);
  codes.push(STOP_CODE);

  // Convert codes to bar/space sequences
  const modules: boolean[] = [];
  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    let isBar = true;
    for (let j = 0; j < pattern.length; j++) {
      const runLen = parseInt(pattern[j], 10);
      for (let k = 0; k < runLen; k++) {
        modules.push(isBar);
      }
      isBar = !isBar;
    }
  });

  const quietZone = 10;
  const totalModules = modules.length + quietZone * 2;
  const svgWidth = totalModules * width;
  const textHeight = showText ? fontSize + 6 : 0;
  const svgHeight = height + textHeight;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width={svgWidth}
      height={svgHeight}
      className={`inline-block ${className}`}
      style={{ shapeRendering: 'crispEdges' }}
      aria-label={`Barcode: ${value}`}
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <g fill="#000000">
        {modules.map((isBar, idx) => {
          if (!isBar) return null;
          const x = (quietZone + idx) * width;
          return <rect key={idx} x={x} y={0} width={width} height={height} />;
        })}
      </g>
      {showText && (
        <text
          x={svgWidth / 2}
          y={height + fontSize}
          textAnchor="middle"
          fill="#1e293b"
          style={{
            fontFamily: 'monospace',
            fontSize: `${fontSize}px`,
            letterSpacing: '1px',
            fontWeight: 600,
          }}
        >
          {value}
        </text>
      )}
    </svg>
  );
}
export default BarcodeSVG;
