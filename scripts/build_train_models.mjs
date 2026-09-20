// Builds one glTF 2.0 vehicle model and one station model per transit mode
// into src/map/models/.
//
//     npm run models
//
// Plain Node, no dependencies: glTF is JSON plus a typed-array buffer, and a
// PNG is a handful of chunks around a zlib stream, which node:zlib already
// does. Kept out of tsconfig's `include`, so it needs no @types/node.
//
// ---------------------------------------------------------------------------
// Why the colour lives in a texture
// ---------------------------------------------------------------------------
// ScenegraphLayer's `getColor` tints a whole scenegraph at once, so the model
// cannot carry its own colours and still be recoloured per line. Checked
// against the installed @deck.gl/mesh-layers@9.4.0, its flat-lighting fragment
// shader is:
//
//     #if defined(HAS_UV) && defined(HAS_BASECOLORMAP)
//     fragColor = vColor * texture(pbr_baseColorSampler, vTEXCOORD_0);
//     #else
//     fragColor = vColor;
//     #endif
//
// `vColor` is the instance colour. So a material's `baseColorFactor` is thrown
// away — a model shaded that way comes out one flat colour — but a base-colour
// TEXTURE is multiplied. That is the hook these models use.
//
// So each model carries an 8x1 pixel palette texture, sampled NEAREST, and
// every vertex's UV picks one texel. The texel is a multiplier: 255 means "the
// line colour exactly", and anything lower is a darker shade of it. That is
// how the window band and the skirt stay dark while the line colour still
// comes through.
//
// ---------------------------------------------------------------------------
// The convention a replacement model must follow
// ---------------------------------------------------------------------------
// - One unit is one metre, and the model is authored at the size the train is
//   drawn when the camera is close (deck.gl scales it by W / 4 from there).
//   Station models are authored against the same W / 4, so a station and the
//   train standing at it keep their proportions at every zoom.
// - +X is the direction of travel, +Y is to the left of it, +Z is up. Note
//   that this is NOT glTF's usual Y-up: deck.gl applies no axis conversion, so
//   a Blender export needs its "+Y Up" option turned OFF.
// - The origin sits at the centre of the vehicle, on its underside, so z = 0
//   is rail level.
// - Shading must come from a base-colour texture, for the reason above.
//
// No normals are written. Flat lighting ignores them, so they would be bytes
// nobody reads; a model that wants `_lighting: 'pbr'` later would add them.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'map', 'models')

// --------------------------------------------------------------------------
// The palette. Each entry multiplies the line colour, so 255 is "untouched".
// --------------------------------------------------------------------------

const PALETTE = [
  // Vehicles.
  [255, 255, 255], // 0 ROOF  - the line colour at full strength
  [223, 226, 231], // 1 BODY  - the sides, a shade off it
  [ 62,  70,  84], // 2 GLASS - the window band, dark and cool
  [124, 128, 136], // 3 SKIRT - below the windows
  [ 46,  48,  52], // 4 UNDER - underframe, and the monorail's beam
  [ 98, 106, 120], // 5 CAB   - the ends, where the windscreen is
  [ 34,  34,  38], // 6 GAP   - the faces either side of a coupling
  // Stations, and they have a set of their own for the reason below.
  [255, 255, 255], // 7  S_ROOF  - seen from above: the line colour, exactly
  [236, 238, 242], // 8  S_SIDE  - the roof's edge and the gable ends
  [206, 210, 216], // 9  S_DECK  - the platform surface and the wall under the glazing
  [164, 168, 176], // 10 S_GLASS - the glazed band, the one darker line in it
  [132, 136, 144], // 11 S_UNDER - soffits and the sides of the deck
]

const ROOF = 0
const BODY = 1
const GLASS = 2
const SKIRT = 3
const UNDER = 4
const CAB = 5
const GAP = 6

/**
 * Why the stations are shaded so much lighter than the vehicles.
 *
 * A texel MULTIPLIES the line colour, so it can only ever darken: 255 is the
 * line colour exactly, and the vehicles' 62 is a quarter of it — which on a
 * dark line like BRT Sunway's `#115740` comes out near-black. A train can
 * afford that, because a dark window band is part of what makes it read as a
 * train. A station cannot: it is the thing somebody is trying to pick out of
 * the city, and the owner's words were "is there a way to make the stations be
 * the line colour". So a station is drawn almost entirely IN the line colour —
 * nothing below about half strength — with one darker band for structure.
 */
const S_ROOF = 7
const S_SIDE = 8
const S_DECK = 9
const S_GLASS = 10
const S_UNDER = 11

/**
 * The horizontal bands every vehicle is built from, bottom to top.
 *
 * `z0`/`z1` are fractions of the body's height and `inset` narrows the band,
 * so the sides step in and out rather than being one slab: an underframe
 * tucked under, a skirt, a recessed window band, the upper body, and a roof
 * pulled in at the shoulders. That stepping is what gives the silhouette
 * something to read from a low angle.
 */
const BANDS = [
  { z0: 0.0, z1: 0.2, shade: UNDER, inset: 0.82, floor: true },
  { z0: 0.2, z1: 0.42, shade: SKIRT, inset: 0.95 },
  { z0: 0.42, z1: 0.72, shade: GLASS, inset: 0.96 },
  { z0: 0.72, z1: 0.9, shade: BODY, inset: 1.0 },
  { z0: 0.9, z1: 1.0, shade: BODY, inset: 0.88, roof: true },
]

// --------------------------------------------------------------------------
// Geometry
// --------------------------------------------------------------------------

function mesh() {
  return { pos: [], uv: [], idx: [] }
}

/**
 * One four-sided face, in the palette shade `shade`.
 *
 * Four fresh vertices every time. Sharing them would mean sharing a UV, and a
 * UV here IS the colour, so a shared corner between the window band and the
 * skirt would have to pick one. Vertices are cheap; a few hundred per model.
 */
function quad(m, a, b, c, d, shade) {
  const i = m.pos.length / 3
  const u = (shade + 0.5) / PALETTE.length
  for (const p of [a, b, c, d]) {
    m.pos.push(p[0], p[1], p[2])
    m.uv.push(u, 0.5)
  }
  m.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
}

/**
 * An axis-aligned box, with the top and bottom faces optionally in their own
 * shade — a station roof is the line colour seen from above and dark from
 * underneath, and one shade for all six faces cannot say that.
 */
function cuboid(m, xa, xb, y0, y1, z0, z1, shade, top = shade, bottom = shade) {
  quad(m, [xa, y1, z0], [xb, y1, z0], [xb, y1, z1], [xa, y1, z1], shade)
  quad(m, [xa, y0, z1], [xb, y0, z1], [xb, y0, z0], [xa, y0, z0], shade)
  quad(m, [xa, y1, z1], [xb, y1, z1], [xb, y0, z1], [xa, y0, z1], top)
  quad(m, [xa, y0, z0], [xb, y0, z0], [xb, y1, z0], [xa, y1, z0], bottom)
  quad(m, [xa, y1, z0], [xa, y0, z0], [xa, y0, z1], [xa, y1, z1], shade)
  quad(m, [xb, y0, z0], [xb, y1, z0], [xb, y1, z1], [xb, y0, z1], shade)
}

/** A box centred on the centre line, used for the monorail's beam and the bus's joint. */
function box(m, xa, xb, hw, z0, z1, shade) {
  cuboid(m, xa, xb, -hw, hw, z0, z1, shade)
}

/**
 * Where the body's half-width sits along a car, as `[fraction, width]` pairs.
 *
 * A tapered end pulls in to 42% over the first sixth of the car, which is what
 * makes a lead car read as a lead car rather than a brick.
 */
function sections(taperA, taperB) {
  const s = []
  if (taperA) s.push([0, 0.42], [0.035, 0.74], [0.085, 0.94], [0.15, 1])
  else s.push([0, 1])
  if (taperB) s.push([0.85, 1], [0.915, 0.94], [0.965, 0.74], [1, 0.42])
  else s.push([1, 1])
  return s
}

/**
 * One car, lofted along its taper profile band by band.
 *
 * `capA`/`capB` shade the flat ends: the cab shade at the ends of the whole
 * vehicle, and the near-black gap shade where one car faces the next, which is
 * what makes the couplings visible from the side.
 */
function addCar(m, { x0, len, hw, h, base = 0, taperA, taperB, capA, capB }) {
  const secs = sections(taperA, taperB)
  for (const band of BANDS) {
    const z0 = base + band.z0 * h
    const z1 = base + band.z1 * h
    for (let i = 0; i < secs.length - 1; i++) {
      const xa = x0 + secs[i][0] * len
      const xb = x0 + secs[i + 1][0] * len
      const wa = secs[i][1] * hw * band.inset
      const wb = secs[i + 1][1] * hw * band.inset
      quad(m, [xa, wa, z0], [xb, wb, z0], [xb, wb, z1], [xa, wa, z1], band.shade)
      quad(m, [xa, -wa, z1], [xb, -wb, z1], [xb, -wb, z0], [xa, -wa, z0], band.shade)
      if (band.floor) {
        quad(m, [xa, -wa, z0], [xb, -wb, z0], [xb, wb, z0], [xa, wa, z0], UNDER)
      }
      if (band.roof) {
        quad(m, [xa, wa, z1], [xb, wb, z1], [xb, -wb, z1], [xa, -wa, z1], ROOF)
      }
    }
    const first = secs[0]
    const last = secs[secs.length - 1]
    const wA = first[1] * hw * band.inset
    const wB = last[1] * hw * band.inset
    quad(m, [x0, wA, z0], [x0, -wA, z0], [x0, -wA, z1], [x0, wA, z1], capA)
    const xEnd = x0 + len
    quad(m, [xEnd, -wB, z0], [xEnd, wB, z0], [xEnd, wB, z1], [xEnd, -wB, z1], capB)
  }
}

/**
 * A multiple-unit train: `cars` cars in a row, tapered at both ends of the set
 * because these are all bidirectional with a cab at each end.
 */
function train({ length, width, height, cars, gap, base = 0 }) {
  const m = mesh()
  const hw = width / 2
  const carLen = (length - gap * (cars - 1)) / cars
  const h = height - base
  for (let i = 0; i < cars; i++) {
    addCar(m, {
      x0: -length / 2 + i * (carLen + gap),
      len: carLen,
      hw,
      h,
      base,
      taperA: i === 0,
      taperB: i === cars - 1,
      capA: i === 0 ? CAB : GAP,
      capB: i === cars - 1 ? CAB : GAP,
    })
  }
  return m
}

/** The monorail, plus the beam it straddles. */
function monorail(spec) {
  const beamTop = spec.height * 0.4
  const m = train({ ...spec, base: spec.height * 0.24 })
  box(m, -spec.length / 2, spec.length / 2, (spec.width / 2) * 0.26, 0, beamTop, UNDER)
  return m
}

/** An articulated bus: two sections with a bellows joint between them. */
function bus({ length, width, height }) {
  const m = mesh()
  const hw = width / 2
  const joint = length * 0.07
  const rear = (length - joint) * 0.42
  const front = (length - joint) * 0.58
  const x0 = -length / 2
  addCar(m, { x0, len: rear, hw, h: height, taperA: false, taperB: false, capA: CAB, capB: GAP })
  box(m, x0 + rear, x0 + rear + joint, hw * 0.84, height * 0.14, height * 0.92, GAP)
  addCar(m, {
    x0: x0 + rear + joint,
    len: front,
    hw,
    h: height,
    taperA: false,
    taperB: true,
    capA: GAP,
    capB: CAB,
  })
  return m
}

// --------------------------------------------------------------------------
// Stations
//
// Two side platforms with the track left open between them. The open centre is
// not decoration: trains are the thing that moves, and a canopy across the
// whole width would hide a train standing at the platform from a camera looking
// down at the city, which is where the camera spends its time. So each platform
// carries its own roof and the middle stays clear.
//
// `inner` is where a platform starts, in metres from the centre line, and it
// has to clear the train. A train sits 0.8 W to the left of the centre and is
// drawn at W / 4; a station is drawn at the same W / 4, so a clearance that
// works at the size authored here works at every zoom. The one exception is a
// stretch two lines share, where a train carries an extra sideways offset
// measured in pixels rather than in W — there a train clips the platform edge
// by a metre or two. Twelve stations on the Ampang corridor, a pixel or two
// each: noted rather than fixed.
// --------------------------------------------------------------------------

function station({
  length,
  width,
  height,
  inner,
  deck,
  roof,
  wall = false,
  gables = false,
  span = 1,
  beam = 0,
}) {
  const m = mesh()
  const hw = width / 2
  const x0 = -length / 2
  const x1 = length / 2
  // How much of the length the roof covers. A bus stop is a shelter in the
  // middle of its platform, not a train shed.
  const r0 = (-length * span) / 2
  const r1 = (length * span) / 2

  for (const side of [1, -1]) {
    const y0 = side > 0 ? inner : -hw
    const y1 = side > 0 ? hw : -inner
    // The deck: a shade down at the edges, the line colour on top where people
    // stand.
    cuboid(m, x0, x1, y0, y1, 0, deck, S_UNDER, S_DECK)
    if (wall) {
      // The outer wall, in two bands. At the size a station is drawn — about
      // twenty pixels long — a glazed band is a line across it, and a line
      // across it is the most detail that survives.
      const wy0 = side > 0 ? hw - 0.7 : -hw
      const wy1 = side > 0 ? hw : -hw + 0.7
      const sill = deck + (roof - deck) * 0.45
      cuboid(m, x0, x1, wy0, wy1, deck, sill, S_DECK)
      cuboid(m, x0, x1, wy0, wy1, sill, roof, S_GLASS)
    }
    // The roof: the line colour exactly from above, a shade down underneath.
    cuboid(m, r0, r1, y0, y1, roof, height, S_SIDE, S_ROOF, S_UNDER)
  }

  // End frames, which is what makes an MRT station read as one enclosed box
  // rather than as two platforms that happen to be side by side.
  if (gables) {
    cuboid(m, x0, x0 + 1.4, -hw, hw, deck, height, S_SIDE, S_ROOF, S_UNDER)
    cuboid(m, x1 - 1.4, x1, -hw, hw, deck, height, S_SIDE, S_ROOF, S_UNDER)
  }

  // The monorail's beam, carried through the station the way its trains carry
  // it, so the two line up instead of the train appearing to float. It runs the
  // full length while the canopy covers only the middle, which is most of what
  // tells a monorail halt from an MRT box at twenty pixels.
  if (beam) cuboid(m, x0, x1, -beam, beam, 0, deck * 1.5, S_UNDER)

  return m
}

// --------------------------------------------------------------------------
// The four modes
//
// Metres, at the size each is drawn when the camera is close. Every one is
// shorter and wider than the real thing: a real four-car set is about 25 times
// longer than it is wide, and at map scale that is under a pixel across. The
// lengths below hold the on-screen size at roughly 15 px for an LRT set, which
// is half what the boxes they replace held.
// --------------------------------------------------------------------------

// A station is about a third longer than the train that stops at it and three
// times its width. A real platform is 150 m by 10 m — fifteen to one — which at
// the zoom a station model is drawn is a sliver one pixel across. Some
// exaggeration of width is unavoidable; this is as little as the shape allows.
//
// SIZE. An LRT station is 26 m long, which the layer draws at about 20 px
// however far away the camera is (length x 3.05 / 4 — see `halfWidth`). The
// first pass was 34 m, or 26 px, and the owner looked at it and said it was too
// big and crowded the city centre. Clicking does NOT depend on this any more:
// the rings are still pickable, and the pick radius in MapView is what makes a
// station easy to hit. So this number is free to be chosen by eye — which is
// the only way it can be chosen.
//
// WIDTH IS NOT FREE, and this is the trap. `inner` has to clear a train
// standing at the platform, so the gap between the platforms cannot shrink; a
// narrower station is a station with shallower platforms, not a narrower gap.
// And the canopy clears the train only because of the ratio between its height
// and its width: the line of sight rises 0.58 m per metre outwards at the
// steepest tilt the map allows, so
//
//     train height + 0.58 x (half-width - train edge) < roof
//
// must hold, or the near canopy covers the very train it stands over. It holds
// for all four below with a little to spare. Widen one and the roof has to come
// up with it.
//
// The four LRT lines mean the LRT station is seen four times as often as any
// other, so it is the one the proportions were chosen for; MRT is the same
// structure, heavier and closed at the ends; the monorail is narrow, low and
// straddles its beam; the bus stop is a shelter and nothing else.

const MODELS = {
  lrt: () => train({ length: 20.0, width: 4.4, height: 3.8, cars: 4, gap: 0.34 }),
  mrt: () => train({ length: 22.4, width: 5.2, height: 4.0, cars: 4, gap: 0.36 }),
  mrl: () => monorail({ length: 12.0, width: 3.2, height: 3.6, cars: 2, gap: 0.28 }),
  brt: () => bus({ length: 10.4, width: 3.2, height: 3.2 }),
  // Open in the middle, walled along the outside, ends left open.
  'station-lrt': () =>
    station({ length: 26, width: 15, height: 6.0, inner: 5.6, deck: 0.9, roof: 5.4, wall: true }),
  // The same structure, longer and closed at both ends: one solid box.
  'station-mrt': () =>
    station({
      length: 29,
      width: 17,
      height: 6.8,
      inner: 6.2,
      deck: 1.0,
      roof: 6.1,
      wall: true,
      gables: true,
    }),
  // Narrow, unwalled, and its beam runs out past both ends of the canopy —
  // which is the silhouette that says monorail at twenty pixels.
  'station-mrl': () =>
    station({
      length: 20,
      width: 12,
      height: 5.1,
      inner: 4.9,
      deck: 0.8,
      roof: 4.5,
      span: 0.72,
      beam: 0.42,
    }),
  // A shelter over the middle of its platforms, and nothing else.
  'station-brt': () =>
    station({ length: 14, width: 12.5, height: 4.8, inner: 4.9, deck: 0.7, roof: 4.3, span: 0.5 }),
}

// --------------------------------------------------------------------------
// PNG. Signature, IHDR, one deflated IDAT, IEND.
// --------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** An 8-bit RGB PNG, one row, one pixel per palette entry. */
function palettePng() {
  const w = PALETTE.length
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type 2 = RGB
  // 10, 11, 12 are compression, filter and interlace: all zero, all default.
  const raw = Buffer.alloc(1 + w * 3) // one row, leading filter byte 0 = none
  PALETTE.forEach(([r, g, b], i) => {
    raw[1 + i * 3] = r
    raw[2 + i * 3] = g
    raw[3 + i * 3] = b
  })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --------------------------------------------------------------------------
// glTF
// --------------------------------------------------------------------------

function toGltf(m, name) {
  const pos = new Float32Array(m.pos)
  const uv = new Float32Array(m.uv)
  const idx = new Uint16Array(m.idx)
  if (pos.length / 3 > 65535) throw new Error(`${name}: too many vertices for 16-bit indices`)

  const buffer = Buffer.concat([
    Buffer.from(pos.buffer),
    Buffer.from(uv.buffer),
    Buffer.from(idx.buffer),
  ])

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k])
      max[k] = Math.max(max[k], pos[i + k])
    }
  }

  return {
    asset: { version: '2.0', generator: 'scripts/build_train_models.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        name,
        primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }],
      },
    ],
    materials: [
      {
        name: 'shading-palette',
        // Unlit in practice: deck.gl's flat path multiplies this texture by the
        // per-train colour and does no lighting at all.
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    // NEAREST both ways, and clamped: a linear filter would blend neighbouring
    // palette entries and the window band would bleed into the roof.
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
    images: [{ mimeType: 'image/png', uri: `data:image/png;base64,${palettePng().toString('base64')}` }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: uv.length / 2, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: uv.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: pos.byteLength + uv.byteLength,
        byteLength: idx.byteLength,
        target: 34963,
      },
    ],
    buffers: [
      {
        byteLength: buffer.length,
        uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
      },
    ],
  }
}

mkdirSync(OUT, { recursive: true })
for (const [name, build] of Object.entries(MODELS)) {
  const m = build()
  const gltf = toGltf(m, name)
  const [min, max] = [gltf.accessors[0].min, gltf.accessors[0].max]
  writeFileSync(join(OUT, `${name}.gltf`), `${JSON.stringify(gltf, null, 1)}\n`, 'utf8')
  const size = [0, 1, 2].map((k) => (max[k] - min[k]).toFixed(2))
  console.log(
    `${name}.gltf  ${m.pos.length / 3} verts, ${m.idx.length / 3} tris  ` +
      `${size[0]} m long x ${size[1]} m wide x ${size[2]} m tall`,
  )
}
