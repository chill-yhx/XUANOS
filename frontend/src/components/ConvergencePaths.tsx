export function ConvergencePaths() {
  const paths = [
    'M4 126 C104 130 176 169 254 231 C312 278 345 303 394 323',
    'M0 190 C118 188 199 217 279 263 C331 293 360 315 396 331',
    'M18 264 C130 251 226 270 303 299 C342 314 370 326 399 337',
    'M0 346 C123 334 236 337 324 342 C352 344 378 344 401 344',
    'M14 428 C133 420 229 397 309 371 C349 358 377 351 401 348',
    'M0 510 C119 489 217 450 300 403 C341 380 371 360 400 351',
    'M30 588 C139 550 227 495 302 430 C340 397 370 368 399 355',
  ]

  return (
    <g className="convergence-paths">
      <g className="convergence-paths__base">
        {paths.map((path) => <path d={path} key={path} />)}
      </g>
      <g className="convergence-paths__flow">
        {paths.filter((_, index) => index % 2 === 0).map((path) => <path d={path} key={path} />)}
      </g>
      <g className="convergence-paths__nodes">
        <circle cx="273" cy="263" r="2.4" />
        <circle cx="323" cy="342" r="2.4" />
        <circle cx="299" cy="404" r="2.4" />
        <circle cx="398" cy="341" r="3.2" />
      </g>
    </g>
  )
}
