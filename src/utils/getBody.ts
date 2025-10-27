import * as THREE from "three";

// Return a joint with the x, y position passed in
function getJoint({
  debug = false,
  RAPIER,
  world,
  xPos = 0,
  yPos = 0,
}: {
  debug: boolean;
  RAPIER: any;
  world: any;
  xPos: number;
  yPos: number;
}) {
  const size = 0.2;
  const density = 0.5;
  let x = xPos;
  let y = yPos;
  let z = 0;

  // Create a dynamic rigid-body.
  let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinearDamping(2);
  let rigid = world.createRigidBody(rigidBodyDesc);
  let colliderDesc = RAPIER.ColliderDesc.ball(size).setDensity(density);
  world.createCollider(colliderDesc, rigid);

  const color = new THREE.Color().setHSL(Math.random(), 1, 0.5);

  let mesh:
    | THREE.Mesh<
        THREE.IcosahedronGeometry,
        THREE.MeshBasicMaterial,
        THREE.Object3DEventMap
      >
    | undefined = undefined;
  if (debug === true) {
    const geometry = new THREE.IcosahedronGeometry(size, 3);
    const material = new THREE.MeshBasicMaterial({
      color,
    });
    mesh = new THREE.Mesh(geometry, material);
  }

  // it only has a mesh if debug is true
  return { color, mesh, rigid };
}

export { getJoint };
