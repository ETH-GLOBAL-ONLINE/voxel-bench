"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function Viewer({ src }: { src: string }) {
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
    scene.add(new THREE.GridHelper(80, 40, 0x4e4840, 0x2a2622));

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

    // No rotation on the loaded scene. Blender is Z-up and three.js is Y-up,
    // but the glTF exporter already converts on the way out — rotating here
    // lays the model flat on its side.
    new GLTFLoader().load(src, (gltf) => {
      scene.add(gltf.scene);
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
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [src]);

  return <div ref={host} className="h-full w-full" />;
}
