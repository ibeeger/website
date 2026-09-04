import { useEffect, useState } from 'react'
import { node, type Process } from '../../core/process'

const CHARS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789'
const COLS = 40
const ROWS = 12
const FRAME_MS = 90
const DURATION_MS = 6000

function randomGrid(): string[] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join(''),
  )
}

function MatrixRain() {
  const [grid, setGrid] = useState(randomGrid)

  useEffect(() => {
    const tick = setInterval(() => setGrid(randomGrid()), FRAME_MS)
    // 自动停下 —— 让它永远跑下去会一直占着 CPU
    const stop = setTimeout(() => clearInterval(tick), DURATION_MS)
    return () => { clearInterval(tick); clearTimeout(stop) }
  }, [])

  return (
    <div className="matrix" aria-hidden="true">
      {grid.map((row, i) => <div key={i}>{row}</div>)}
    </div>
  )
}

export const matrix: Process = {
  name: 'matrix',
  description: '数字雨',
  usage: 'matrix',
  hidden: true,

  async run(io) {
    io.stdout.write(node(<MatrixRain />, () => '[matrix rain]'))
    return 0
  },
}
