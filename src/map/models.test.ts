import { describe, expect, it } from 'vitest'
import brt from './models/brt.gltf?raw'
import lrt from './models/lrt.gltf?raw'
import mrl from './models/mrl.gltf?raw'
import mrt from './models/mrt.gltf?raw'

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
 * Every one is shorter and wider than the real thing, because a real four-car
 * set is 25 times longer than it is wide and at map scale that is under a pixel
 * across. Chosen by eye. See scripts/build_train_models.mjs.
 */
const EXPECTED: Record<string, [number, number, number]> = {
  lrt: [20.0, 4.4, 3.8],
  mrt: [22.4, 5.2, 4.0],
  mrl: [12.0, 3.2, 3.6],
  brt: [10.4, 3.2, 3.2],
}

const FILES = { lrt, mrt, mrl, brt }

/** A data-URI buffer, back into bytes. */
function decode(uri: string): Uint8Array {
  const binary = atob(uri.slice(uri.indexOf(',') + 1))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
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

  it('lies along +X and sits on z = 0', () => {
    // The convention `yawFor` and the viaduct height both assume: travel along
    // +X, left along +Y, up from zero. A Blender export with "+Y Up" left on
    // would fail this, and would otherwise just lie on its side in the city.
    const { min, max } = gltf.accessors[prim.attributes.POSITION]
    expect(min[2]).toBeCloseTo(0, 6)
    expect(min[0]).toBeCloseTo(-max[0], 6)
    expect(max[0]).toBeGreaterThan(max[1])
    expect(max[0]).toBeGreaterThan(max[2])
  })
})
