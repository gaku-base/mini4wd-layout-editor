# Collision engine domain contract

## Scope

Phase 2.0は、sampled collision profileを世界座標へ変換し、保守的AABBでnarrow phase対象候補を抽出する。ここで扱うのはコースパーツ本体だけであり、支柱、橋脚、補強材、固定具、テープ、会場床は入力モデルへ含めない。

この段階では三角形メッシュや簡略衝突形状の厳密交差を行わない。AABBの重複は`candidate`であり、`collision`ではない。

## 世界座標変換

配置姿勢は、パーツローカル原点の世界XYZ座標と、Z軸まわり45度単位の回転で表す。station断面の点は次の順で変換する。

1. `centerlinePositionMm`をstation原点とする。
2. YZ断面点のYを`tangentHeadingDeg`に直交する横方向、Zをstation原点からの上方向オフセットとしてローカルXYZ点へ変換する。
3. パーツ配置の45度回転をZ軸まわりへ適用する。
4. 配置原点のXYZを加算する。

走行面、下面、呼び出し側が指定した対象側壁のうち、実測済みの有限な点だけを変換する。`unknown / null`、空点列、未知の中心線位置、未知の接線角度は0へ変換せず、不足stationと不足項目へ記録する。元profile、station、配置情報は変更しない。

## 保守的AABB

AABBを生成できるのは、次の条件をすべて満たすprofileだけとする。

- profile statusが`unknown`ではない。
- 指定されたcollision readinessを満たす。
- 対象stationの`centerlinePositionMm`と`tangentHeadingDeg`が既知である。
- 走行面、下面、対象側壁の全点を世界座標へ変換できる。
- 配置姿勢が既知である。

AABBは対象となる全世界座標点の最小値・最大値を包含する。浮動小数点丸めによる過小評価を避けるため、各軸の座標絶対値から`Number.EPSILON * 16`を基準にパディングを導出する。この値は計算上のガードであり、mm単位の物理公差、製造公差、接触許容距離ではない。

条件が不足する場合、既知点だけから架空のAABBを作らず`aabb: null`とし、`indeterminate`診断へ渡す。

## Broad phase diagnostics

配置済みパーツのinstance IDをコードポイント順に並べ、`left ID < right ID`の全一意ペアを評価する。入力配列の順序は結果へ影響しない。同じinstance自身とのペアは生成しない。

診断statusは次の4種類とする。

- `clear`：両方の既知AABBがXYまたはZで分離している。
- `candidate`：AABBが重複し、後続narrow phaseが必要である。衝突確定ではない。
- `indeterminate`：profile、station項目、または配置姿勢が不足し、安全なAABBを生成できない。不完全profileは、見かけ上離れていても`clear`にしない。
- `excluded-normal-contact`：正式接続と既知の正常接触除外volumeが両端で確認でき、後続narrow phaseへ正常接触除外契約を渡せる。

各診断は、part instance ID、profile参照、取得できた世界AABB、理由コード、不足station、不足項目、AABB重複範囲を返す。重複範囲は将来の赤色候補表示に利用できるが、実際の干渉範囲ではない。

## Normal contact safety

`excluded-normal-contact`は、次の条件をすべて満たす場合だけ返す。

- 入力に該当する正式なコネクタ接続関係がある。
- 接続両端のprofileに、該当connector ID用の`normalContactExclusion`がある。
- 両方のexclusionとvolumeが既知で、volume種別に必要な形状データがある。
- `appliesOnlyWhenFormallyConnected`が有効である。

接続関係がない、片側だけ既知、またはvolumeが`unknown / null`の場合は除外しない。Phase 2.0は複雑な除外volumeと候補範囲の厳密交差を行わないため、`excluded-normal-contact`はペア全体がcollision-freeであることを意味しない。候補抽出APIは`candidate`と`excluded-normal-contact`の両方をnarrow phase対象として返し、後続処理は除外volume外の形状を引き続き評価する。
