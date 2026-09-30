export function calculateAngle(a, b, c) {

    if (!a || !b || !c) {
        return null;
    }


    const ab = {

        x: a.x - b.x,
        y: a.y - b.y

    };


    const cb = {

        x: c.x - b.x,
        y: c.y - b.y

    };


    const dot =
        ab.x * cb.x +
        ab.y * cb.y;


    const magAB =
        Math.sqrt(
            ab.x * ab.x +
            ab.y * ab.y
        );


    const magCB =
        Math.sqrt(
            cb.x * cb.x +
            cb.y * cb.y
        );


    if (
        magAB === 0 ||
        magCB === 0
    ) {

        return null;
    }


    let cosine =
        dot /
        (magAB * magCB);


    // Prevent floating-point errors
    // from creating NaN.

    cosine =
        Math.max(
            -1,
            Math.min(
                1,
                cosine
            )
        );


    let angle =
        Math.acos(
            cosine
        );


    angle =
        angle *
        180 /
        Math.PI;


    return Number(
        angle.toFixed(1)
    );
}