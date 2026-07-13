import type {
  CollisionProfileCatalog,
  CollisionProfileReference,
  SampledCollisionProfile,
} from './types'

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

export function selectActiveCollisionProfile(
  catalog: CollisionProfileCatalog,
  active: CollisionProfileReference,
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

  return { ...catalog, active: { ...active } }
}
