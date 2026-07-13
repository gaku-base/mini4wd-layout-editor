import type {
  CollisionProfileCatalog,
  CollisionProfileReference,
  SampledCollisionProfile,
} from './types'
import {
  assessCollisionProfileReadiness,
  type CollisionReadinessRequirements,
  type ProfileReadinessAssessment,
  type ProfileUsePurpose,
} from './readiness'

export function collisionProfileReference(
  profile: SampledCollisionProfile,
): CollisionProfileReference {
  return {
    profileId: profile.profileId,
    version: profile.version,
    variantId: profile.variantId,
  }
}

function sameReference(
  left: CollisionProfileReference,
  right: CollisionProfileReference,
): boolean {
  return (
    left.profileId === right.profileId &&
    left.version === right.version &&
    left.variantId === right.variantId
  )
}

export function addCollisionProfileVersion(
  catalog: CollisionProfileCatalog,
  profile: SampledCollisionProfile,
): CollisionProfileCatalog {
  const reference = collisionProfileReference(profile)

  if (catalog.profiles.some((candidate) => sameReference(collisionProfileReference(candidate), reference))) {
    throw new Error('Collision profile version and variant already exist')
  }

  return { ...catalog, profiles: [...catalog.profiles, profile] }
}

export interface ActiveCollisionProfileSelectionOptions {
  readonly purpose: ProfileUsePurpose
  readonly collisionRequirements?: CollisionReadinessRequirements
}

export class ProfileNotReadyError extends Error {
  readonly purpose: ProfileUsePurpose
  readonly assessment: ProfileReadinessAssessment

  constructor(
    purpose: ProfileUsePurpose,
    assessment: ProfileReadinessAssessment,
  ) {
    super(`Collision profile is not ready for ${purpose}`)
    this.name = 'ProfileNotReadyError'
    this.purpose = purpose
    this.assessment = assessment
  }
}

export function selectActiveCollisionProfileForPurpose(
  catalog: CollisionProfileCatalog,
  active: CollisionProfileReference,
  options: ActiveCollisionProfileSelectionOptions,
): CollisionProfileCatalog {
  const selected = catalog.profiles.find((profile) =>
    sameReference(collisionProfileReference(profile), active),
  )

  if (selected === undefined) {
    throw new Error('Active collision profile does not exist in the catalog')
  }

  if (selected.status === 'unknown') {
    throw new Error('An unknown collision profile cannot be selected as active')
  }

  const assessment = assessCollisionProfileReadiness(
    selected,
    options.collisionRequirements,
  )
  const status =
    options.purpose === 'structurally-valid'
      ? assessment.structural.status
      : options.purpose === 'height-chain-ready'
        ? assessment.heightChain.status
        : assessment.collision.status

  if (status !== options.purpose) {
    throw new ProfileNotReadyError(options.purpose, assessment)
  }

  return { ...catalog, active: { ...active } }
}

/**
 * Compatibility wrapper for Issue #13 callers. It proves structural validity only;
 * collision use must call selectActiveCollisionProfileForPurpose explicitly.
 */
export function selectActiveCollisionProfile(
  catalog: CollisionProfileCatalog,
  active: CollisionProfileReference,
): CollisionProfileCatalog {
  return selectActiveCollisionProfileForPurpose(catalog, active, {
    purpose: 'structurally-valid',
  })
}
