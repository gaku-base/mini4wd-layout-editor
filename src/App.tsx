import { SLOPE, STRAIGHT } from './domain/parts'

export function App() {
  return (
    <main>
      <p className="eyebrow">Phase 1 foundation</p>
      <h1>Mini 4WD Layout Editor</h1>
      <p>
        UIから独立した、mm単位の2.5D座標・コネクタ計算基盤を準備しました。
      </p>
      <dl>
        <div>
          <dt>{STRAIGHT.name}</dt>
          <dd>{STRAIGHT.dimensions.length.value} mm</dd>
        </div>
        <div>
          <dt>{SLOPE.name} 高低差</dt>
          <dd>{SLOPE.dimensions.elevationGain.value} mm</dd>
        </div>
      </dl>
      <p className="note">完成エディターUIはPhase 3以降で実装します。</p>
    </main>
  )
}
