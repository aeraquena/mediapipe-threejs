import * as THREE from "three";

const sceneMiddle = new THREE.Vector3(0, 0, 0);
const metaOffset = new THREE.Vector3(0.5, 0.5, 0.5);

// Creates a new object with rigid body, color, optional mesh, and update function
function getBody({
  debug = false,
  RAPIER,
  world,
}: {
  debug?: boolean;
  RAPIER: any;
  world: any;
}) {
  const size = Math.random() * 0.2 + 0.1;
  const range = 3;
  const density = 0.5;
  let x = Math.random() * range - range * 0.5;
  let y = Math.random() * range - range * 0.5 + 3;
  let z = Math.random() * range - range * 0.5;
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

  function update() {
    rigid.resetForces(true);
    let { x, y, z } = rigid.translation();
    let pos = new THREE.Vector3(x, y, z);
    let dir = pos.clone().sub(sceneMiddle).normalize();
    rigid.addForce(dir.multiplyScalar(-0.5), true);
    if (debug === true) {
      mesh?.position.copy(pos);
    }
    pos.multiplyScalar(0.1).add(metaOffset);
    return pos;
  }
  // it only has a mesh if debug is true
  return { color, mesh, rigid, update, name: "" }; // TODO: Add name. does rigid body work
}

// Return a joint with the x, y position passed in
// Could take in pose: number[]
// Needs to have names
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
  let x = xPos; // TODO: From pose - pass this in
  let y = yPos; // TODO: From pose - pass this in
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

  function update(/* take in new x, y */) {
    rigid.resetForces(true);
    let { x, y, z } = rigid.translation();
    let pos = new THREE.Vector3(x, y, z);
    let dir = pos.clone().sub(sceneMiddle).normalize();
    rigid.addForce(dir.multiplyScalar(-0.5), true);
    if (debug === true) {
      mesh?.position.copy(pos);
    }
    pos.multiplyScalar(0.1).add(metaOffset);
    return pos;
  }
  // it only has a mesh if debug is true
  return { color, mesh, rigid, update, name: "" };
}

export { getBody, getJoint };
