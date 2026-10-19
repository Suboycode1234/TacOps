import * as THREE from 'three';

export class FXManager {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
  }

  // Draw crisp, bright CS-style bullet tracer beam
  createTracer(from, to, color = 0xffe066) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.25) return;

    // Luminous 3D beam cylinder with authentic thickness
    const radius = 0.022;
    const geo = new THREE.CylinderGeometry(radius, radius, len, 6);
    // Align cylinder from center to tip
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    mesh.lookAt(to);
    this.scene.add(mesh);

    this.tracers.push({
      mesh: mesh,
      life: 0.18,
      maxLife: 0.18,
      initialRadius: radius,
    });
  }

  // Spark burst for wall / metal impacts
  createSparkImpact(pos, normal) {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.025, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb733 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);

      // Velocity reflected along normal with cone dispersion
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 1.8,
        Math.random() * 1.8,
        (Math.random() - 0.5) * 1.8
      );
      const vel = normal.clone().multiplyScalar(2.8).add(spread);

      this.scene.add(p);
      this.particles.push({
        mesh: p,
        vel: vel,
        life: 0.32,
        maxLife: 0.32,
        gravity: 12.0,
      });
    }
  }

  // Blood splatter for body hits
  createBloodImpact(pos) {
    const count = 16;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.035, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0x990000 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.8,
        (Math.random() - 0.2) * 2.8,
        (Math.random() - 0.5) * 2.8
      );

      this.scene.add(p);
      this.particles.push({
        mesh: p,
        vel: vel,
        life: 0.38,
        maxLife: 0.38,
        gravity: 9.8,
      });
    }
  }

  // Headshot "Dink" golden sparks
  createHeadshotSparks(pos) {
    const count = 24;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.03, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffea75 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.2,
        Math.random() * 3.8,
        (Math.random() - 0.5) * 4.2
      );

      this.scene.add(p);
      this.particles.push({
        mesh: p,
        vel: vel,
        life: 0.35,
        maxLife: 0.35,
        gravity: 10.0,
      });
    }
  }

  update(delta) {
    // Update tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= delta;
      const progress = Math.max(0, t.life / t.maxLife);
      t.mesh.material.opacity = progress * 0.95;
      // Shrink thickness as tracer fades
      t.mesh.scale.x = progress;
      t.mesh.scale.y = progress;

      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      p.vel.y -= p.gravity * delta;
      p.mesh.position.addScaledVector(p.vel, delta);
      p.mesh.scale.setScalar(p.life / p.maxLife);

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
