/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Uma estante do Gemba: estrutura (montantes, longarinas, travessas, decks nas
 * estantes leves), a carga real do que está guardado e uma caixa de clique por
 * vão. Geometria vinda de `gembaLayout`; carga de `gembaCarga`.
 */

import React, { memo, useMemo, useState } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import {
  DESCRICAO_DEPOSITO_PLANTA, alturaDaEstante, caixaDaEstante, caixaDoVao, estanteAoLongoDeX, faixaDoAndar, normalDaFace,
  quantidadeVaos, type Caixa, type EstanteGemba,
} from '../../../lib/gembaLayout';
import { pecasDaEstante, type CargaNoAndar, type FormaPeca, type Peca } from '../../../lib/gembaCarga';
import { doisDigitos } from '../../../lib/gembaEndereco';
import Instancias from './Instancias';
import Rotulo from './Rotulo';
import { geometrias, type Materiais } from './recursos';
import type { CoresGemba } from './coresGemba';

interface Props {
  estante: EstanteGemba;
  cargas: CargaNoAndar[];
  cores: CoresGemba;
  materiais: Materiais;
  esmaecida: boolean;
  emFoco: boolean;
  sombras: boolean;
  vaoSelecionado: number | null;
  onClicarVao: (estanteId: string, indice: number) => void;
  onPairarVao: (estanteId: string, indice: number | null) => void;
  /** Celular: títulos das ruas só de perto, para não se amontoarem na visão geral. */
  compacto: boolean;
}

const MONTANTE = 0.09;
const LONGARINA = 0.12;
/** Arrasto maior que isso (px) é girar a câmera, não clicar. */
const ARRASTO_MAXIMO = 6;
const FORMAS: FormaPeca[] = ['palete', 'caixa', 'saco', 'bobina', 'flange', 'balde', 'perfil', 'bin'];

function useEstrutura(e: EstanteGemba) {
  return useMemo(() => {
    const n = quantidadeVaos(e);
    const vaos = Array.from({ length: n }, (_, i) => caixaDoVao(e, i));
    const total = caixaDaEstante(e);
    const aoX = estanteAoLongoDeX(e);
    const altura = alturaDaEstante(e);
    const [cx, , cz] = total.centro;
    const [sx, , sz] = total.tamanho;
    const meiaProf = e.profundidadeM / 2 - MONTANTE / 2;
    const lados = [-meiaProf, meiaProf];
    const leve = e.alturasAndarM.every(h => h < 1.2);

    const niveis = [e.alturaChaoM];
    for (let andar = 1; andar <= e.alturasAndarM.length; andar++) niveis.push(faixaDoAndar(e, andar)![1]);

    const montantes: Caixa[] = [];
    const travessas: Caixa[] = [];
    const inicioEixo = aoX ? cx - sx / 2 : cz - sz / 2;
    for (let k = 0; k <= n; k++) {
      const a = Math.min(inicioEixo + k * e.larguraBlocoM, inicioEixo + (aoX ? sx : sz));
      for (const l of lados) {
        montantes.push({ centro: aoX ? [a, altura / 2, cz + l] : [cx + l, altura / 2, a], tamanho: [MONTANTE, altura, MONTANTE] });
      }
      // Travessas do quadro lateral (ligam o montante da frente ao de trás).
      for (const y of [0.15, ...niveis.slice(1)]) {
        travessas.push({
          centro: aoX ? [a, y - 0.05, cz] : [cx, y - 0.05, a],
          tamanho: aoX ? [0.04, 0.04, e.profundidadeM] : [e.profundidadeM, 0.04, 0.04],
        });
      }
    }

    const longarinas: Caixa[] = [];
    const decks: Caixa[] = [];
    niveis.forEach((y, i) => {
      for (const l of lados) {
        longarinas.push({
          centro: aoX ? [cx, y - LONGARINA / 2, cz + l] : [cx + l, y - LONGARINA / 2, cz],
          tamanho: aoX ? [sx, LONGARINA, 0.06] : [0.06, LONGARINA, sz],
        });
      }
      if (leve && i < niveis.length - 1) {
        decks.push({ centro: [cx, y - 0.012, cz], tamanho: aoX ? [sx, 0.024, sz * 0.94] : [sx * 0.94, 0.024, sz] });
      }
    });
    return { vaos, montantes, travessas, longarinas, decks, altura };
  }, [e]);
}

function GembaEstante({
  estante, cargas, cores, materiais, esmaecida, emFoco, sombras, vaoSelecionado, onClicarVao, onPairarVao, compacto,
}: Props) {
  const g = useEstrutura(estante);
  const geo = geometrias();
  const [hover, setHover] = useState<number | null>(null);

  const porForma = useMemo(() => {
    const mapa = new Map<FormaPeca, Peca[]>(FORMAS.map(f => [f, []]));
    for (const p of pecasDaEstante(estante, cargas)) mapa.get(p.forma)!.push(p);
    return mapa;
  }, [estante, cargas]);

  const ativo = (i: number) => i < estante.blocos.length || estante.blocos.length === 0;
  const aoClicar = (i: number) => (ev: ThreeEvent<MouseEvent>) => {
    ev.stopPropagation();
    if (ev.delta > ARRASTO_MAXIMO) return;
    onClicarVao(estante.id, i);
  };

  // Placas amarelas nas duas pontas, do lado do corredor (ruas de costas uma para a outra não se cobrem).
  const [nx, nz] = normalDaFace(estante.face);
  const recuo = estante.profundidadeM / 2 + 0.9;
  const ehAnexoPlaca = Boolean(estante.apartamentos);
  const pontas = [g.vaos[0], g.vaos[g.vaos.length - 1]];
  // Placa fora da ponta da estante (não fica na frente do bloco 01 tampando o que se procura).
  const foraDaPonta = (v: Caixa): [number, number, number] => {
    const centro = caixaDaEstante(estante).centro;
    const dx = v.centro[0] - centro[0];
    const dz = v.centro[2] - centro[2];
    const d = Math.hypot(dx, dz) || 1;
    const passo = estante.larguraBlocoM / 2 + (ehAnexoPlaca ? 0.5 : 1.0);
    return [v.centro[0] + (dx / d) * passo + nx * recuo * 0.5, Math.min(g.altura, 2.2), v.centro[2] + (dz / d) * passo + nz * recuo * 0.5];
  };
  const nomePlaca = estante.trilha[estante.trilha.length - 1].toUpperCase();
  const ehAnexo = Boolean(estante.apartamentos);
  const meio = caixaDaEstante(estante).centro;
  const descricao = DESCRICAO_DEPOSITO_PLANTA[estante.deposito];
  const opacidadeRotulo = esmaecida ? 0.45 : 1;
  const sombraCarga = sombras && !esmaecida;

  return (
    <group>
      <Instancias itens={g.montantes} geometria={geo.caixa} material={materiais.montante} sombra={sombras} />
      <Instancias itens={g.longarinas} geometria={geo.caixa} material={materiais.longarina} sombra={sombras} />
      <Instancias itens={g.travessas} geometria={geo.caixa} material={materiais.montante} />
      <Instancias itens={g.decks} geometria={geo.caixa} material={materiais.deck} sombra={sombras} />

      <Instancias itens={porForma.get('palete')!} geometria={geo.palete} material={materiais.carga} sombra={sombraCarga} />
      <Instancias itens={porForma.get('caixa')!} geometria={geo.caixa} material={materiais.carga} sombra={sombraCarga} />
      <Instancias itens={porForma.get('saco')!} geometria={geo.saco} material={materiais.carga} sombra={sombraCarga} />
      <Instancias itens={porForma.get('bobina')!} geometria={geo.bobina} material={materiais.carga} sombra={sombraCarga} />
      <Instancias itens={porForma.get('flange')!} geometria={geo.flange} material={materiais.carga} sombra={sombraCarga} />
      <Instancias itens={porForma.get('balde')!} geometria={geo.balde} material={materiais.metal} sombra={sombraCarga} />
      <Instancias itens={porForma.get('perfil')!} geometria={geo.perfil} material={materiais.metal} sombra={sombraCarga} />
      <Instancias itens={porForma.get('bin')!} geometria={geo.bin} material={materiais.plastico} />

      {g.vaos.map((v, i) => {
        const clicavel = ativo(i);
        const selecionado = vaoSelecionado === i;
        const realce = selecionado ? 0.18 : hover === i && clicavel ? 0.12 : 0;
        return (
          <mesh
            key={i}
            position={v.centro}
            onClick={clicavel ? aoClicar(i) : undefined}
            onPointerOver={clicavel ? (ev) => {
              ev.stopPropagation();
              setHover(i);
              onPairarVao(estante.id, i);
              document.body.style.cursor = 'pointer';
            } : undefined}
            onPointerOut={clicavel ? () => {
              setHover(h => (h === i ? null : h));
              onPairarVao(estante.id, null);
              document.body.style.cursor = '';
            } : undefined}
          >
            <boxGeometry args={v.tamanho} />
            <meshBasicMaterial color={selecionado ? cores.selecao : cores.hover} transparent opacity={realce} depthWrite={false} />
            {selecionado && <Edges color={cores.selecao} />}
          </mesh>
        );
      })}

      {pontas.map((v, k) => (
        <Rotulo
          key={`placa${k}`}
          texto={nomePlaca}
          posicao={foraDaPonta(v)}
          estilo={cores.placaRua}
          metros={ehAnexo ? 0.24 : 0.5}
          opacidade={opacidadeRotulo}
        />
      ))}

      {!ehAnexo && descricao && (
        <Rotulo
          texto={`${nomePlaca}  ${descricao.toUpperCase()}`}
          // Afasta o título para o lado do corredor: as ruas de costas (05/04, 03/02) não empilham os nomes.
          posicao={[meio[0] + nx * 3.2, g.altura + 0.9, meio[2] + nz * 3.2]}
          estilo={{ fundo: cores.montante, tinta: '#ffffff', borda: cores.montante }}
          px={compacto ? 11 : 13}
          opacidade={opacidadeRotulo}
          distanciaMaxima={compacto ? 95 : undefined}
        />
      )}

      {emFoco && g.vaos.slice(0, estante.blocos.length).map((v, i) => (
        <Rotulo
          key={`n${i}`}
          texto={doisDigitos(estante.blocos[i])}
          posicao={[v.centro[0] + nx * 0.2, g.altura + 0.28, v.centro[2] + nz * 0.2]}
          estilo={{ fundo: cores.rotulo.fundo, tinta: cores.rotulo.tinta, borda: cores.montante }}
          metros={ehAnexo ? 0.2 : 0.3}
        />
      ))}
    </group>
  );
}

export default memo(GembaEstante);
