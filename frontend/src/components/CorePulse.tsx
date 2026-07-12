export function CorePulse() {
  return (
    <>
      <g className="heart-core-pulse" filter="url(#heartShadow)">
        <path
          className="heart-core-halo"
          d="M490 201 C463 169 423 162 393 190 C357 223 353 280 378 338 C399 386 431 423 446 473 C456 507 466 540 476 560 C486 581 503 581 516 553 C540 504 584 458 612 402 C641 345 643 274 613 222 C590 182 550 166 516 180 C504 185 496 193 490 201 Z"
        />
        <path
          className="heart-core-body"
          d="M490 213 C466 181 430 174 403 199 C372 227 370 278 392 329 C411 374 442 408 456 458 C466 491 474 521 482 542 C489 560 501 560 511 537 C532 490 574 446 599 394 C624 343 627 278 601 231 C582 196 548 179 518 191 C506 195 498 204 490 213 Z"
        />
        <g clipPath="url(#heartClip)">
          <path className="heart-facet heart-facet--left" d="M381 205 C425 250 450 306 466 372 C478 422 480 474 481 542 L355 446 L340 267 Z" />
          <path className="heart-facet heart-facet--crown" d="M407 176 C457 191 479 228 490 275 C508 231 538 194 592 191 L618 277 L493 362 Z" />
          <path className="heart-facet heart-facet--right" d="M492 275 C555 250 590 272 620 320 L582 463 L488 551 L474 390 Z" />
          <path className="heart-specular" d="M416 217 C393 268 411 321 440 359" />
          <path className="heart-specular heart-specular--fine" d="M535 205 C571 244 582 293 570 343" />
          <path className="heart-brushed-metal" d="M457 197 C479 243 490 289 490 347" />
        </g>

        <g className="heart-core-energy">
          <path d="M416 326 C444 312 463 322 478 347 C495 375 509 390 543 398" />
          <path d="M441 424 C456 400 466 379 478 347 C489 319 508 285 550 255" />
          <path d="M478 347 C480 410 486 456 491 510" />
        </g>
        <g className="heart-core-inlays">
          <path d="M405 279 C438 288 459 307 478 347" />
          <path d="M478 347 C510 345 542 352 580 369" />
          <path d="M478 347 C468 389 469 430 486 477" />
        </g>
        <g className="heart-core-cracks">
          <path d="M432 236 L445 263 L440 287 L454 310" />
          <path d="M549 293 L530 311 L534 330 L510 352" />
          <path d="M456 414 L472 429 L468 451" />
        </g>
        <g className="heart-state-trajectory">
          <path d="M425 414 C442 396 452 379 462 357 C474 332 493 308 537 277" />
          <circle cx="425" cy="414" r="2.8" />
          <circle cx="462" cy="357" r="2.8" />
          <circle cx="492" cy="314" r="2.8" />
          <circle cx="537" cy="277" r="3.2" />
        </g>
      </g>

      <g className="heart-decision-output">
        <path className="heart-decision-seam" d="M478 347 C540 347 597 362 663 374" />
        <circle className="heart-focus-node" cx="663" cy="374" r="4" />
        <path className="heart-output heart-output--glow" d="M663 374 C731 369 798 365 916 362" />
        <path className="heart-output" d="M663 374 C731 369 798 365 916 362" />
        <path className="heart-output-pulse" d="M663 374 C731 369 798 365 916 362" pathLength="100" />
        <path className="heart-output-marker" d="M864 350 L878 362 L864 374" />
      </g>
    </>
  )
}
