import { CalibrationOrbit } from './CalibrationOrbit'
import { ConvergencePaths } from './ConvergencePaths'
import { CorePulse } from './CorePulse'

export function XuanosHeartCore() {
  return (
    <div className="heart-core" aria-hidden="true">
      <div className="heart-core-volume-light" />
      <svg className="heart-core-svg" viewBox="0 0 920 760" role="presentation">
        <defs>
          <linearGradient id="heartChampagne" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#735c34" stopOpacity="0.16" />
            <stop offset="0.48" stopColor="#d8c38f" stopOpacity="0.76" />
            <stop offset="1" stopColor="#fff1c1" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id="heartTitanium" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#171817" stopOpacity="0.12" />
            <stop offset="0.52" stopColor="#aaa69b" stopOpacity="0.26" />
            <stop offset="1" stopColor="#111210" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="heartOutput" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7b6133" stopOpacity="0.2" />
            <stop offset="0.38" stopColor="#d8c38f" stopOpacity="0.92" />
            <stop offset="0.72" stopColor="#fff1c1" stopOpacity="0.58" />
            <stop offset="1" stopColor="#fff1c1" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="heartObsidian" cx="30%" cy="18%" r="92%">
            <stop offset="0" stopColor="#35332e" />
            <stop offset="0.16" stopColor="#151411" />
            <stop offset="0.53" stopColor="#050505" />
            <stop offset="0.78" stopColor="#0d0c0a" />
            <stop offset="1" stopColor="#010101" />
          </radialGradient>
          <linearGradient id="heartFacet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4f0e7" stopOpacity="0.1" />
            <stop offset="0.3" stopColor="#f4f0e7" stopOpacity="0" />
            <stop offset="0.7" stopColor="#8b6d39" stopOpacity="0.12" />
            <stop offset="1" stopColor="#000" stopOpacity="0.46" />
          </linearGradient>
          <filter id="heartShadow" x="-80%" y="-80%" width="260%" height="290%">
            <feDropShadow dx="0" dy="34" stdDeviation="31" floodColor="#000" floodOpacity="0.86" />
          </filter>
          <filter id="heartBloom" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <clipPath id="heartClip">
            <path d="M490 213 C466 181 430 174 403 199 C372 227 370 278 392 329 C411 374 442 408 456 458 C466 491 474 521 482 542 C489 560 501 560 511 537 C532 490 574 446 599 394 C624 343 627 278 601 231 C582 196 548 179 518 191 C506 195 498 204 490 213 Z" />
          </clipPath>
        </defs>

        <ellipse className="heart-core-shadow" cx="494" cy="629" rx="205" ry="31" />
        <ellipse className="heart-core-waterline heart-core-waterline--far" cx="494" cy="612" rx="292" ry="43" />
        <ellipse className="heart-core-waterline" cx="494" cy="604" rx="220" ry="28" />
        <ConvergencePaths />
        <CalibrationOrbit />
        <CorePulse />
      </svg>
      <div className="heart-core-name">
        <span>玄枢心核</span>
        <small>XUANOS HEART CORE</small>
      </div>
    </div>
  )
}
