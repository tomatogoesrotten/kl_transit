import { describe, expect, it } from 'vitest'
import brt from './models/brt.gltf?raw'
import lrt from './models/lrt.gltf?raw'
import mrl from './models/mrl.gltf?raw'
import mrt from './models/mrt.gltf?raw'
import stationBrt from './models/station-brt.gltf?raw'
import stationLrt from './models/station-lrt.gltf?raw'
import stationMrl from './models/station-mrl.gltf?raw'
import stationMrt from './models/station-mrt.gltf?raw'

/**
 * The models are build output, committed to the repo, and `npm run models`
 * regenerates them. These checks guard the handful of things the rest of the
 * app quietly assumes about whatever file is sitting there — including a
 * better one exported from Blender.
 *
 * The one that really matters is the base-colour texture. deck.gl's flat
 * lighting multiplies `getColor` by that texture and IGNORES a material's own
 * colour, so a model without one is not shaded badly, it is a single flat
 * silhouette in the line colour. See scripts/build_train_models.mjs.
 */

/**
 * The size each model is authored at, in metres: length, width, height.
 *
 * A station is about a third longer than the train that stops at it, where a
 * real platform is seven times longer. The exaggeration of width is what makes
 * it a shape rather than a sliver; the length is chosen by eye, and it came
 * DOWN from 34 m after the owner saw it. The layer draws 26 m as about 20 px.
 * See scripts/build_train_models.mjs.
 */
const EXPECTED: Record<string, [number, number, number]> = {
  lrt: [20.0, 4.4, 3.8],
  mrt: [22.4, 5.2, 4.0],
  mrl: [12.0, 3.2, 3.6],
  brt: [10.4, 3.2, 3.2],
  'station-lrt': [26.0, 15.0, 6.0],
  'station-mrt': [29.0, 17.0, 6.8],
  'station-mrl': [20.0, 12.0, 5.1],
  'station-brt': [14.0, 12.5, 4.8],
}

const FILES = {
  lrt,
  mrt,
  mrl,
  brt,
  'station-lrt': stationLrt,
  'station-mrt': stationMrt,
  'station-mrl': stationMrl,
  'station-brt': stationBrt,
}

/** A data-URI buffer, back into bytes. */
function decode(uri: string): Uint8Array {
  const binary = atob(uri.slice(uri.indexOf(',') + 1))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * The distinct palette texels a model samples, as their u coordinates.
 *
 * A UV here IS the colour: the texture is one row of palette entries and every
 * vertex's u picks one of them. So the set of u values a file uses is the set
 * of shades it is built from.
 */
function shadesUsed(text: string): number[] {
  const gltf = JSON.parse(text)
  const prim = gltf.meshes[0].primitives[0]
  const buffer = decode(gltf.buffers[0].uri)
  const view = gltf.bufferViews[gltf.accessors[prim.attributes.TEXCOORD_0].bufferView]
  const uv = new Float32Array(
    buffer.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
  )
  return [...new Set(uv.filter((_, i) => i % 2 === 0))]
}

describe.each(Object.entries(FILES))('%s.gltf', (name, text) => {
  const gltf = JSON.parse(text)
  const prim = gltf.meshes[0].primitives[0]

  it('is a glTF 2.0 file with one self-contained buffer', () => {
    expect(gltf.asset.version).toBe('2.0')
    expect(gltf.buffers).toHaveLength(1)
    // Embedded, so the file can be dropped in on its own with no .bin beside it.
    expect(gltf.buffers[0].uri.startsWith('data:')).toBe(true)
    expect(decode(gltf.buffers[0].uri).byteLength).toBe(gltf.buffers[0].byteLength)
  })

  it('shades itself with a base-colour texture, which is what lets it be tinted', () => {
    expect(prim.attributes.TEXCOORD_0).toBeDefined()
    const material = gltf.materials[prim.material]
    const tex = material.pbrMetallicRoughness.baseColorTexture
    expect(tex).toBeDefined()
    const sampler = gltf.samplers[gltf.textures[tex.index].sampler]
    // NEAREST. A linear filter would blend the palette's neighbouring entries
    // and smear the window band into the roof.
    expect(sampler.magFilter).toBe(9728)
    expect(sampler.minFilter).toBe(9728)
    expect(gltf.images[gltf.textures[tex.index].source].uri.startsWith('data:image/png')).toBe(true)
  })

  it('has indices that all point at a vertex it has', () => {
    const buffer = decode(gltf.buffers[0].uri)
    const view = gltf.bufferViews[gltf.accessors[prim.indices].bufferView]
    const indices = new Uint16Array(
      buffer.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
    )
    const vertices = gltf.accessors[prim.attributes.POSITION].count
    expect(indices.length % 3).toBe(0)
    expect(Math.max(...indices)).toBeLessThan(vertices)
  })

  it('is the size it is documented at, in metres', () => {
    // The layer scales by W / 4, so these ARE the metres a train covers once
    // the camera is close enough for the size floor to take over.
    const { min, max } = gltf.accessors[prim.attributes.POSITION]
    const size = [0, 1, 2].map((k) => max[k] - min[k])
    expect(size[0]).toBeCloseTo(EXPECTED[name][0], 3)
    expect(size[1]).toBeCloseTo(EXPECTED[name][1], 3)
    expect(size[2]).toBeCloseTo(EXPECTED[name][2], 3)
  })

  it('reads its shading from the half of the palette its kind belongs to', () => {
    // A texel multiplies the line colour, so it can only darken. The vehicles'
    // entries go down to a quarter of it — a dark window band is part of what
    // makes a train a train — and the stations' never go below about half,
    // because a station is what somebody is trying to pick out of the city.
    // The two sets are disjoint on purpose, and this is what says so: a station
    // face pointed back at a vehicle shade is the near-black station the owner
    // rejected, and it would fail here.
    const mine = shadesUsed(text)
    const others = Object.entries(FILES)
      .filter(([other]) => other.startsWith('station-') !== name.startsWith('station-'))
      .flatMap(([, otherText]) => shadesUsed(otherText))
    for (const u of mine) {
      for (const v of others) {
        expect(u === v).toBe(false)
      }
    }
  })

  it('lies along +X and sits on z = 0', () => {
    // The convention `yawFor` and the viaduct height both assume: travel along
    // +X, left along +Y, up from zero. A Blender export with "+Y Up" left on
    // would fail this, and would otherwise just lie on its side in the city.
    // A station is oriented by the track it stands on, so it follows the same
    // convention: its platforms run along +X, not across it.
    const { min, max } = gltf.accessors[prim.attributes.POSITION]
    expect(min[2]).toBeCloseTo(0, 6)
    expect(min[0]).toBeCloseTo(-max[0], 6)
    expect(max[0]).toBeGreaterThan(max[1])
    expect(max[0]).toBeGreaterThan(max[2])
  })
})
