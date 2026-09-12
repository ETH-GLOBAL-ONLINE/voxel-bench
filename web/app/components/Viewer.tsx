"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * `closer` frames the object twice as close. Worth it for the sample garden,
 * which is seventy studs across and reads as a speck otherwise; a crafted prop
 * keeps the frame with room around it.
 */
export default function Viewer({ src, closer = false }: { src: string; closer?: boolean }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1816);

    const camera = new THREE.PerspectiveCamera(
      42,
      el.clientWidth / el.clientHeight,
      0.1,
      600,
    );
    camera.position.set(24, 15, 24);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 4, 0);
    controls.maxPolarAngle = Math.PI / 2.05;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2622, 2.1));
    const lamp = new THREE.DirectionalLight(0xffd9a0, 2.3);
    lamp.position.set(12, 20, 9);
    scene.add(lamp);
    const grid = new THREE.GridHelper(80, 40, 0x4e4840, 0x2a2622);
    scene.add(grid);

    // A 5-stud stand-in for a Roblox character, so scale is judged by eye
    // rather than by reading a number.
    const figure = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      color: 0x7a7167,
      roughness: 0.95,
    });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), skin);
    legs.position.y = 1;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), skin);
    torso.position.y = 3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), skin);
    head.position.y = 4.6;
    figure.add(legs, torso, head);
    figure.position.set(-11, 0, 4);
    scene.add(figure);

    // Meshes come out of Blender Draco-compressed, which turns a nine-megabyte
    // scene into about one. The decoder is served from public/draco and fetched
    // once; an uncompressed file still loads through the same path.
    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);

    // No rotation on the loaded scene. Blender is Z-up and three.js is Y-up,
    // but the glTF exporter already converts on the way out — rotating here
    // lays the model flat on its side.
    loader.load(src, (gltf) => {
      scene.add(gltf.scene);

      // Frame whatever arrived. The starting camera suits a crate; a garden is
      // seventy studs across and would sit half outside the panel. Reading the
      // bounding box means one viewer serves both without a number per object.
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      const middle = bounds.getCenter(new THREE.Vector3());
      const reach = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(reach) || reach <= 0) return;

      // A frame with room to spare, or twice as close when asked: then the
      // object fills the panel and orbiting shows the rest.
      const distance =
        (reach / 2 / Math.tan((camera.fov * Math.PI) / 360)) * (closer ? 0.75 : 1.5);
      camera.position.set(
        middle.x + distance * 0.7,
        middle.y + distance * 0.45,
        middle.z + distance * 0.7,
      );
      camera.far = distance * 6;
      camera.updateProjectionMatrix();

      // Aim a little below the middle: the ground is the part people read
      // scale from, and the figure stands on it.
      controls.target.set(middle.x, middle.y - size.y * 0.15, middle.z);
      controls.update();

      // The grid and the figure are placed for a crate too. Keep the grid
      // squares one stud across whatever the object's size, so counting them
      // is a second way to read scale.
      const span = Math.ceil(Math.max(size.x, size.z) * 1.4);
      grid.geometry.dispose();
      scene.remove(grid);
      scene.add(new THREE.GridHelper(span, span, 0x4e4840, 0x2a2622));

      figure.position.set(bounds.min.x - 3, 0, bounds.max.z + 2);
    });

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      // The decoder holds a worker pool; without this every re-render of the
      // viewer leaves one behind.
      draco.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [src, closer]);

  // The wheel zooms the model here, so the page's smooth scroll stays out.
  return <div ref={host} data-lenis-prevent className="h-full w-full" />;
}
