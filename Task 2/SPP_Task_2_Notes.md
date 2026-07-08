# Prototype 1

## Problem 1 (Puffer zwischen Circleanzeige und Pfeilanzeige)

### Ursprünglicher Code

```typescript
const onScreen = !isBehind && Math.abs(ndc.x) <= 0.8 && Math.abs(ndc.y) <= 0.8;
```

### Lösung

```typescript
const onScreen = !isBehind && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
```

---

## Problem 2 (Aktuelle Berechnung durch NDC)

### Ursprünglicher Code

```typescript
const angle = Math.atan2(ndc.y, ndc.x);
```

### Lösung

```typescript
const physicalX = ndc.x * (frustumWidth / 2);
const physicalY = ndc.y * (frustumHeight / 2);
const angle = Math.atan2(physicalY, physicalX);
```


---

## Problem 3 (Folgefehler von Problem 2 – Circle verhält sich falsch)

Der Circle-Mechanismus ist definiert durch:

```typescript
if (onScreen && (distance >= DISTANCE_MAX || this.currentState === 'circle')) {
    this.currentState = 'circle';
    ...
}
```

### Lösung

Da das `update()` zuvor über mehrere unabhängige `if`-Abfragen die States gewechselt hat, wurde `currentState === 'arrow'` stets priorisiert. Die Logik wurde daher auf `else if`-Abfragen umgestellt.



---

## Problem 4 (Distanzparameter sind festgelegt)

### Ursprünglicher Code

```typescript
const DISTANCE_MAX = 20.0;
const DISTANCE_MIN = 18.0;
```

### Lösung

Der Konstruktor wurde erweitert:

```typescript
constructor(scene, camera, config) {

    // Fail fast: enforce explicit configuration to prevent unintended behavior
    if (
        !config ||
        typeof config.distanceMin === 'undefined' ||
        typeof config.distanceMax === 'undefined'
    ) {
        throw new Error(
            "ARWayfindingHUD initialization failed: A configuration object containing " +
            "'distanceMin' and 'distanceMax' is strictly required to define the spatial hysteresis."
        );
    }

    this.camera = camera;

    // Map the enforced configuration variables
    this.distanceMin = config.distanceMin;
    this.distanceMax = config.distanceMax;

    // HUD distance remains optional as it is purely visual, falling back to 2.5m
    this.hudDistance =
        config.hudDistance !== undefined ? config.hudDistance : 2.5;

    this.targetStates = [];

    // Bind HUD to the camera transform to keep indicators in view space.
    scene.add(this.camera);
}
```

---

## Problem 5 (Komponente funktioniert nicht mit mehreren Targets)

### Lösung

Jedes Target erhält nun ein eigenes Paar aus Pfeil und Kreis. Diese werden in einem Array gespeichert. Dadurch überschreiben sich die Zustände verschiedener Targets nicht mehr, und jedes Target besitzt seine eigene unabhängige Kreis-/Pfeil-Darstellung.

---

## Problem 6 (Kreis wird zu lange angezeigt)

### Lösung

```typescript
const VIEWPORT_INNER = 1.0;
const VIEWPORT_OUTER = 1.05;

let onScreen = false;

if (!isBehind) {

    if (state.currentState === 'arrow') {

        // Wait until the pivot point explicitly enters the visible frame
        onScreen =
            Math.abs(ndc.x) <= VIEWPORT_INNER &&
            Math.abs(ndc.y) <= VIEWPORT_INNER;

    } else {

        // Keep it "on-screen" until it is pushed definitively past the outer buffer zone
        onScreen =
            Math.abs(ndc.x) <= VIEWPORT_OUTER &&
            Math.abs(ndc.y) <= VIEWPORT_OUTER;

    }

}
```


---

## Problem 7 (Inkonsistenz bei der Kreisanzeige durch Rotation)

### Lösung

Anpassung der OrbitControls, sodass sich die Kamera wie eine Free-Roam-Kamera verhält. Dadurch treten keine Inkonsistenzen bei der Kreisanzeige durch kamerabedingte Rotationen mehr auf.
