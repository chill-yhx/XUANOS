export function CalibrationOrbit() {
  return (
    <g className="heart-orbits">
      <g className="heart-orbit heart-orbit--outer">
        <ellipse cx="488" cy="350" rx="324" ry="286" pathLength="100" />
        <circle cx="186" cy="247" r="3.4" />
        <circle cx="750" cy="516" r="2.8" />
      </g>
      <g className="heart-orbit heart-orbit--middle">
        <ellipse cx="488" cy="350" rx="275" ry="242" pathLength="100" />
        <path d="M269 203 L288 184 L313 174" />
        <path d="M689 487 L716 500 L731 521" />
      </g>
      <g className="heart-orbit heart-orbit--calibration">
        <ellipse cx="488" cy="350" rx="228" ry="202" pathLength="100" />
        <circle cx="340" cy="197" r="3" />
        <circle cx="653" cy="446" r="3" />
      </g>
      <g className="heart-orbit heart-orbit--inner">
        <ellipse cx="488" cy="350" rx="184" ry="166" pathLength="100" />
        <path d="M352 458 L340 438 L334 416" />
        <circle cx="496" cy="184" r="3.2" />
      </g>
      <ellipse className="heart-orbit-ticks heart-orbit-ticks--outer" cx="488" cy="350" rx="302" ry="267" pathLength="100" />
      <ellipse className="heart-orbit-ticks heart-orbit-ticks--inner" cx="488" cy="350" rx="208" ry="185" pathLength="100" />
    </g>
  )
}
