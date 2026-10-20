/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena 3D do Gemba (three.js via React Three Fiber). Carregada só na rota do
 * Gemba (`React.lazy`) para o three não pesar no resto do app.
 *
 * `frameloop="demand"`: só desenha quando algo muda (câmera, destaque pulsando),
 * o que poupa bateria no celular.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import { ESTANTES, alturaDaEstante, caixaDoVao, centroDoGalpao, vistaGeral, type Localizacao, type Vista } from '../../../lib/gembaLayout';
import Rotulo from './Rotulo';
import type { CargaNoAndar } from '../../../lib/gembaCarga';
import GembaPiso from './GembaPiso';
import GembaEstante from './GembaEstante';
import GembaMarcos from './GembaMarcos';
import GembaDestaque from './GembaDestaque';
import { coresGemba, useEscuro } from './coresGemba';
import { criarMateriais, descartarMateriais } from './recursos';

export interface SelecaoVao {
  estanteId: string;
  indice: number;
}

interface Props {
  destaques: Localizacao[];
  principal: number;
  /** Para onde a câmera vai; `versaoVista` muda para repetir a mesma vista. */
  vista: Vista;
  versaoVista: number;
  selecao: SelecaoVao | null;
  onClicarVao: (estanteId: string, indice: number) => void;
  reduzido: boolean;
  /** Carga real (só onde a ZL0024 tem saldo), já resolvida por estante e vão. */
  cargas: CargaNoAndar[];
  /** Quantos itens com saldo estão em cada zona com nome (ex.: apoio_manutencao). */
  porZona: Record<string, number>;
  /** Texto da dica ao passar o mouse num vão; `null` esconde. */
  rotuloVao: (estanteId: string, indice: number) => string | null;
}

const [OX, , OZ] = centroDoGalpao();

const WASD: Record<string, string> = { w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight' };

function Camera({ vista, versaoVista, reduzido }: Pick<Props, 'vista' | 'versaoVista' | 'reduzido'>) {
  const ref = useRef<CameraControls>(null);
  const invalidate = useThree(s => s.invalidate);
  const camera = useThree(s => s.camera);
  const tamanho = useThree(s => s.size);
  useEffect(() => {
    let [cx, cy, cz] = vista.camera;
    const [ax, ay, az] = vista.alvo;
    let enquadrar = vista.enquadrar;
    const emPe = tamanho.width / Math.max(tamanho.height, 1) < 0.9;
    if (enquadrar && emPe) {
      // Tela em pé (celular): olha do lado da Entrada, com o comprimento do galpão na vertical.
      [cx, cz] = [ax + (cz - az), az - (cx - ax)];
      enquadrar = [enquadrar[1], enquadrar[0]];
    }
    if (enquadrar && camera instanceof THREE.PerspectiveCamera) {
      // Recua na mesma direção até a área caber na proporção atual da tela (celular em pé precisa de mais).
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (tamanho.width / Math.max(tamanho.height, 1)));
      const precisa = (emPe ? 1.12 : 1.3) * Math.max(enquadrar[0] / 2 / Math.tan(hfov / 2), enquadrar[1] / 2 / Math.tan(vfov / 2));
      const d = Math.hypot(cx - ax, cy - ay, cz - az);
      const k = precisa / d;
      [cx, cy, cz] = [ax + (cx - ax) * k, ay + (cy - ay) * k, az + (cz - az) * k];
    }
    void ref.current?.setLookAt(cx - OX, cy, cz - OZ, ax - OX, ay, az - OZ, !reduzido);
    // Com frameloop="demand" a transição só anda se alguém pedir o 1º quadro.
    invalidate();
    // A vista muda sempre junto com a versão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versaoVista]);
  // Teclado: setas ou WASD andam no plano do piso, com Shift giram; + e − aproximam.
  // Fica fora de campos de texto para a busca continuar usando as setas.
  useEffect(() => {
    const giro = THREE.MathUtils.degToRad(12);
    const aoTeclar = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const c = ref.current;
      if (!c) return;
      const passo = Math.max(0.8, c.distance * 0.07);
      const animar = !reduzido;
      const tecla = WASD[ev.key.toLowerCase()] ?? ev.key;
      switch (tecla) {
        case 'ArrowUp':
          if (ev.shiftKey) void c.rotate(0, -giro / 2, animar); else void c.forward(passo, animar);
          break;
        case 'ArrowDown':
          if (ev.shiftKey) void c.rotate(0, giro / 2, animar); else void c.forward(-passo, animar);
          break;
        case 'ArrowLeft':
          if (ev.shiftKey) void c.rotate(giro, 0, animar); else void c.truck(-passo, 0, animar);
          break;
        case 'ArrowRight':
          if (ev.shiftKey) void c.rotate(-giro, 0, animar); else void c.truck(passo, 0, animar);
          break;
        case '+':
        case '=':
          void c.dolly(passo * 1.5, animar);
          break;
        case '-':
        case '_':
          void c.dolly(-passo * 1.5, animar);
          break;
        default:
          return;
      }
      ev.preventDefault();
      invalidate();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [invalidate, reduzido]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={1.2}
      maxDistance={180}
      maxPolarAngle={Math.PI / 2 - 0.05}
      smoothTime={0.45}
    />
  );
}

/** Sombra só onde há GPU de sobra (computador); no celular o mapa fica sem ela. */
function querSombras(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: fine)').matches === true && window.innerWidth >= 1024;
}

/** A sombra é desenhada uma vez e refeita só quando a carga ou o tema mudam. */
function AtualizarSombra({ chave }: { chave: string }) {
  const gl = useThree(s => s.gl);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [chave, gl, invalidate]);
  return null;
}

const SEM_CARGA: CargaNoAndar[] = [];

export default function GembaCena({
  destaques, principal, vista, versaoVista, selecao, onClicarVao, reduzido, cargas, porZona, rotuloVao,
}: Props) {
  const escuro = useEscuro();
  const cores = coresGemba(escuro);
  const geral = useMemo(() => vistaGeral(), []);
  const sombras = useMemo(querSombras, []);
  const compacto = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 640, []);

  const materiais = useMemo(() => criarMateriais(cores, false), [cores]);
  const esmaecidos = useMemo(() => criarMateriais(cores, true), [cores]);
  useEffect(() => () => { descartarMateriais(materiais); descartarMateriais(esmaecidos); }, [materiais, esmaecidos]);

  const cargasPorEstante = useMemo(() => {
    const mapa = new Map<string, CargaNoAndar[]>();
    for (const c of cargas) {
      const lista = mapa.get(c.estanteId) ?? [];
      lista.push(c);
      mapa.set(c.estanteId, lista);
    }
    return mapa;
  }, [cargas]);

  const acesas = useMemo(() => new Set(destaques.flatMap(d => d.estruturas)), [destaques]);
  const emFoco = useMemo(() => {
    const s = new Set(acesas);
    if (selecao) s.add(selecao.estanteId);
    return s;
  }, [acesas, selecao]);
  const algoAceso = destaques.length > 0;

  const [pairando, setPairando] = useState<{ estanteId: string; indice: number } | null>(null);
  const aoPairar = useCallback((estanteId: string, indice: number | null) => {
    setPairando(atual => (indice == null ? (atual?.estanteId === estanteId ? null : atual) : { estanteId, indice }));
  }, []);
  const dica = useMemo(() => {
    if (!pairando) return null;
    const estante = ESTANTES.find(e => e.id === pairando.estanteId);
    const texto = rotuloVao(pairando.estanteId, pairando.indice);
    if (!estante || !texto) return null;
    const v = caixaDoVao(estante, pairando.indice);
    return { texto, posicao: [v.centro[0], alturaDaEstante(estante) + 0.7, v.centro[2]] as [number, number, number] };
  }, [pairando, rotuloVao]);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      shadows={sombras}
      onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; }}
      camera={{ fov: 45, near: 0.1, far: 1000, position: [geral.camera[0] - OX, geral.camera[1], geral.camera[2] - OZ] }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[cores.fundo]} />
      <hemisphereLight args={['#f2f7fb', escuro ? '#1e293b' : '#8e9298', escuro ? 0.85 : 1.0]} />
      <ambientLight intensity={escuro ? 0.18 : 0.25} />
      <directionalLight
        position={[34, 60, 22]}
        intensity={escuro ? 0.9 : 1.25}
        castShadow={sombras}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-64}
        shadow-camera-right={64}
        shadow-camera-top={44}
        shadow-camera-bottom={-44}
        shadow-camera-near={5}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {sombras && <AtualizarSombra chave={`${cargas.length}|${escuro}|${porZona.apoio_manutencao ?? 0}`} />}
      <Camera vista={vista} versaoVista={versaoVista} reduzido={reduzido} />

      <group position={[-OX, 0, -OZ]}>
        <GembaPiso cores={cores} sombras={sombras} compacto={compacto} />
        <GembaMarcos materiais={materiais} itensApoio={porZona.apoio_manutencao ?? 0} sombras={sombras} />
        {ESTANTES.map(e => {
          const esmaecida = algoAceso && !acesas.has(e.id);
          return (
            <GembaEstante
              key={e.id}
              estante={e}
              cargas={cargasPorEstante.get(e.id) ?? SEM_CARGA}
              cores={cores}
              materiais={esmaecida ? esmaecidos : materiais}
              esmaecida={esmaecida}
              emFoco={emFoco.has(e.id)}
              sombras={sombras}
              vaoSelecionado={selecao?.estanteId === e.id ? selecao.indice : null}
              onClicarVao={onClicarVao}
              onPairarVao={aoPairar}
              compacto={compacto}
            />
          );
        })}
        <GembaDestaque localizacoes={destaques} principal={principal} cores={cores} reduzido={reduzido} />
        {dica && (
          <Rotulo
            texto={dica.texto}
            posicao={dica.posicao}
            estilo={{ fundo: cores.rotulo.fundo, tinta: cores.rotulo.tinta, borda: cores.hover }}
            px={13}
            sempreVisivel
          />
        )}
      </group>
    </Canvas>
  );
}
