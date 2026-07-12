import type { CSSProperties } from 'react'

const particles = Array.from({ length: 24 }, (_, index) => {
  const x = (index * 37 + 11) % 100
  const y = (index * 61 + 7) % 100
  const size = index % 9 === 0 ? 3 : index % 4 === 0 ? 2 : 1
  const duration = 52 + (index % 7) * 7

  return { id: index, x, y, size, duration, driftX: (index % 5) - 2, driftY: ((index * 3) % 5) - 2 }
})

export function ParticleBackground() {
  return (
    <div className="particle-background" aria-hidden="true">
      {particles.map((particle) => {
        const style = {
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          '--duration': `${particle.duration}s`,
          '--drift-x': `${particle.driftX * 7}px`,
          '--drift-y': `${particle.driftY * 9}px`,
        } as CSSProperties & Record<string, string>

        return <span key={particle.id} className="particle" style={style} />
      })}
    </div>
  )
}
