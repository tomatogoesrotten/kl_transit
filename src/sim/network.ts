import raw from '../../data/network.json'
import type { Network } from './types'

// The one cast in the codebase. TypeScript widens the JSON's fixed-length arrays
// (`path` to number[][], and each headway triple likewise), which is not assignable
// to the tuple types the simulation uses. The shapes are otherwise identical, and
// src/network.test.ts checks the file's shape at runtime.
export const network = raw as unknown as Network
