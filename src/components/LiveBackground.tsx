/**
 * Animated cinema wallpaper rendered behind every page.
 *
 * Pure CSS (server component, zero client JS): diagonal film strips that scroll
 * endlessly, spinning film reels, a flickering projector beam and film grain.
 * All motion stops when the user prefers reduced motion (see globals.css).
 */

const FRAMES_A = ["🎬", "🍿", "🎥", "🦖", "🚀", "👽", "🎞️", "🦸", "🎟️", "🧙"];
const FRAMES_B = ["🌌", "🤠", "🧛", "🏴‍☠️", "🕵️", "🐉", "🤖", "🎭", "⭐", "🦈"];
const FRAMES_C = ["🎃", "🧟", "🏰", "🛸", "🦁", "🥊", "🚗", "👻", "🗡️", "🎤"];

function FilmStrip({ frames, className }: { frames: string[]; className: string }) {
  // Frames are rendered twice so translating by -50% loops seamlessly.
  const all = [...frames, ...frames];
  return (
    <div className={`film-strip ${className}`}>
      <div className="film-track">
        {all.map((icon, i) => (
          <div key={i} className="film-frame">
            <span>{icon}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilmReel({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`film-reel ${className}`}>
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="7" fill="currentColor" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <circle
          key={deg}
          cx={50 + 26 * Math.cos((deg * Math.PI) / 180)}
          cy={50 + 26 * Math.sin((deg * Math.PI) / 180)}
          r="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      ))}
    </svg>
  );
}

export function LiveBackground() {
  return (
    <div aria-hidden className="live-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <FilmStrip frames={FRAMES_A} className="film-strip-1" />
      <FilmStrip frames={FRAMES_B} className="film-strip-2" />
      <FilmStrip frames={FRAMES_C} className="film-strip-3" />

      <FilmReel className="film-reel-1" />
      <FilmReel className="film-reel-2" />

      {/* Projector beam from the top, with a light flicker */}
      <div className="live-beam" />

      <div className="live-grain" />
      {/* Vignette keeps the centre calm so content stays readable */}
      <div className="live-vignette" />
    </div>
  );
}
