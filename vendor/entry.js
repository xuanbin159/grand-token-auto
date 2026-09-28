// Vendor bundle for Grand Token Auto: three r186 + addons + three-vrm + pmndrs postprocessing + N8AO.
// Built by vendor/build.mjs into ONE classic IIFE that sets window.THREE before the game IIFE (game.js) runs.
// Module namespaces are frozen, so window.THREE is a plain copy; ShaderChunk / ShaderLib / prototypes stay shared.
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { UltraHDRLoader } from 'three/examples/jsm/loaders/UltraHDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import * as VRM from '@pixiv/three-vrm';
import * as VRMA from '@pixiv/three-vrm-animation';
import * as POSTPROCESSING from 'postprocessing';
import { N8AOPostPass, N8AOPass } from 'n8ao';

// the game authors every colour as sRGB hex and decodes in its shaders (03_render.js gtaLin): no second decode on the CPU
T.ColorManagement.enabled = false;

const mergeGeometries = BufferGeometryUtils.mergeGeometries;
window.THREE = Object.assign({}, T, {
  GLTFLoader, KTX2Loader, DRACOLoader, HDRLoader, RGBELoader: HDRLoader, UltraHDRLoader, MeshoptDecoder,
  SkeletonUtils, BufferGeometryUtils, mergeGeometries, mergeBufferGeometries: mergeGeometries,
  RoomEnvironment, LightProbeGenerator, Sky,
  VRM, VRMA, VRMLoaderPlugin: VRM.VRMLoaderPlugin, VRMUtils: VRM.VRMUtils, MToonMaterial: VRM.MToonMaterial,
  VRMHumanBoneName: VRM.VRMHumanBoneName, VRMExpressionPresetName: VRM.VRMExpressionPresetName,
  VRMAnimationLoaderPlugin: VRMA.VRMAnimationLoaderPlugin, createVRMAnimationClip: VRMA.createVRMAnimationClip,
  VRMLookAtQuaternionProxy: VRMA.VRMLookAtQuaternionProxy,
  POSTPROCESSING, N8AOPostPass, N8AOPass,
  VENDOR: { three: T.REVISION, vrm: '3.5.5', postprocessing: POSTPROCESSING.version, n8ao: '2.0.1' },
});
