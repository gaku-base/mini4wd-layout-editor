# 意思決定ログ

### Default fast-path placement for Straight and 45-degree corners (2026-07-29)

- Fast repeated placement is part of the normal placement workflow, not a
  separate editing mode. A confirmed Straight, `corner-45-right`, or
  `corner-45-left` advances an in-memory fast-path placement anchor to its exit.
- The OS pointer is never moved. Until it travels more than 10px from the
  confirmation point, the already visible anchored proposal is committed again.
- After meaningful movement, the next type is selected in screen pixels
  relative to the exit tangent: centre within 20px is Straight, at least 30px
  to the right is right corner, and at least 30px to the left is left corner.
  The 20–30px band preserves the current type to prevent flicker.
- The fast-path anchor and automatic type-selection state are session-only and
  are excluded from JSON, localStorage, Undo/Redo, and layout data.

### Concrete left/right corner part types (2026-07-29)

- 45-degree corners use the concrete catalog types `corner-45-right` and
  `corner-45-left`; a part type, rather than runtime mirror state, is the
  source of truth for its physical curve, lanes, and connectors.
- The selected corner direction changes the ghost type. Confirmation copies
  that type directly to the placed part. Connector A/B selection and tangent
  rotation remain automatic geometry decisions and cannot change the type.
- New layouts do not persist `handedness`, `cornerHandedness`, or
  `cornerMirror`. Legacy corner JSON migrates only from its semantic direction.

## 2026-07-25: 静的RC保存形式の後方互換性

- 現行保存形式は `1.1.0-RC2` とする。
- `1.0.0-RC1` は正式対応する旧形式とし、復元時にメモリ上で `field.originX = 0`、`field.originY = 0` を補完する。パーツ、姿勢、色、描画順、接続情報は変更しない。
- 旧形式の復元処理中はlocalStorageへ書き込まない。次の編集確定、明示保存、またはJSON読込後の保存時にRC2形式へ移行する。
- 未対応バージョンの正常データは削除せず、現在のアプリからのlocalStorage書込みを止めて上書きを防ぐ。
- JSON破損または必須構造・値の不正だけを `corrupt` として削除する。

## 2026-07-13

### プロジェクト分離

- コースレイアウトアプリは、既存の `mini4wd-race-app` から独立したリポジトリで開発する。
- リポジトリ名は `gaku-base/mini4wd-layout-editor`。
- レース運営アプリとの連携はv1.0完成後に必要性を判断する。

### 製品の中心

- 3D編集ではなく2D編集を中心とする。
- 内部ではmm単位のXYZ座標と実寸3D形状を保持する2.5D設計アプリとする。
- 3Dプレビューはv1.0後の判断項目とする。

### 操作方式

- 数字キーとパーツ構成は `https://mini4wd-track-editor.pimentoso.com/` を参考にする。
- 数字キーでパーツを選択する。
- 選択したパーツは半透明シャドーとしてマウスポインターへ追従する。
- 一つ前のパーツの出口角度からシャドー初期角度を決定する。
- 初期角度は候補のみ。ホイール、Z、Xによる手動回転を優先する。
- ホイール回転は45度刻み。
- クリックで直前パーツへ吸着して配置する。

### 部分編集

- パーツ1個を変更しても、その他のコースを連動させない。
- 複数連結パーツを移動しても、選択範囲外を連動させない。
- 連結区間は走行方向の両方向から選択可能にする。
- 選択区間は独立した仮置きグループとして保持する。

### 接続補助

- つながりそうな未接続端点間へ、接続可能なパーツ構成をシャドー表示する。
- 作成者が候補に沿って配置した場合、残り候補を追従更新する。
- 異なる配置を行った場合、現在状態から再探索する。

### 高さ・干渉

- ストレート1枚の長さは540mm。
- スロープ1枚の高低差は115mm。
- 支柱、橋脚、補強材、固定具はレイアウト時の干渉判定に含めない。
- 判定対象はコースパーツ本体同士のみ。
- XY上の重なりだけでエラーにせず、上下の実寸3D形状を比較する。
- スロープは入口付近と出口付近で下を通れる空間が異なるため、下面・側壁を含む精密な3D形状を基に判定する。
- 干渉したパーツと範囲は赤色で視覚表示し、アラートを出す。

### 外部サイトの扱い

- NOIR Course Layout Makerは寸法・形状・操作の参考にする。
- NOIRのコード、画像、3Dモデル、ロゴ、素材はコピーしない。
- 独自の表示形状と衝突判定用形状を作る。

### 開発運用

- ChatGPTは仕様管理・レビューを担当する。
- CodexはGitHub上で実装・テスト・PR作成を担当する。
- GitHubの仕様書、Issue、PRを共通の作業記録とする。
- PRのマージと寸法確定などの重要判断はユーザー承認を残す。

### 計測プロトコルとcollision profile

- Phase 2へ進む前に、寸法・接続点・外形・3Dプロファイルへ測定元、測定日、測定者、許容誤差、信頼度を記録する。
- 全物理数値を`verified` / `provisional` / `unknown`で管理し、未確認値は`null`として推測値を置かない。
- パーツローカル座標はmm単位の右手系XYZとし、曲線・スロープの長手方向位置は入口から中心基準線に沿った`sMm`で表す。
- 走行面、下面、側壁は長手方向stationごとのYZ断面で表現し、スロープ下面を単純な直方体へ固定しない。
- 正常接触除外範囲は正式接続されたコネクタ同士だけに適用し、接続関係のない食い込みを除外しない。
- collision profileはsemantic version付きの不変データとしてパーツマスターから参照し、差し替え時も旧版を保持する。
- 初期対象は3レーンのストレート、45度コーナー、スロープ、バンクとする。
- 支柱、橋脚、補強材、固定具、テープ、会場床は計測マスターと干渉判定の対象外とする。
- 外部公開画面は人が通常の方法で観察して得た数値だけを参考にする。コード、画像、3Dモデル、メッシュ、テクスチャ、ロゴの保存・コピー、開発者ツール等による抽出、保護回避、自動巡回、大量アクセスを禁止する。
- 法令または利用規約に疑義がある方法が必要になった場合は実行せず、Issueへ報告する。
- スロープとバンクは、将来NOIRの公開3D表示を通常の画面操作だけで観察し、上面・側面・正面・背面・斜視など複数視点と、入口・中央・出口・中間の複数断面から採寸する。
- 公開3D表示から得た数値は原則`provisional`とし、公式寸法または実物採寸で確認できた値だけを`verified`へ昇格する。
- スロープは長手方向`sMm`、バンクは`sMm`または中心角`thetaDeg`でstationを位置付け、走行面、下面、側壁、通過可能空間を同じ断面へ関連付ける。
- スロープの上り／下り、バンクの方向反転・左右向きは、同一物理形状または鏡像同形である証跡がある場合だけ元profileから変換して再利用する。未確認の場合は別profileとして`unknown`から管理する。

### 手動採寸セッション運用

- 公開3D表示の採寸は、手動採寸セッションガイドとスロープ／バンクの専用ワークシートを使用し、第三者が同じ条件で再実施できる記録を残す。
- 上面、左右側面、正面、背面、斜視、station確認視点をview IDで管理し、カメラ、投影、表示倍率、校正条件を記録する。
- 縮尺校正には確定済みのストレート540mmまたはスロープ高低差115mmだけを使用し、表示条件が変わった場合は再校正する。
- スロープは入口、25%、50%、75%、出口、バンクは入口、25%、中央、75%、出口を基本stationとし、形状変化点には理由付きの追加stationを設ける。割合は採寸計画上のラベルであり、実寸値ではない。
- 同一箇所の各読取値を残し、計画回数、実施回数、平均、最大差、推定誤差の方法と結果、信頼度、状態を記録する。
- 誤差成分や基準点を評価できない場合は数値を作らず`unknown`とし、公開画面から得た値は原則`provisional`とする。
- 一時スクリーンショットは手動計測にだけ使用し、リポジトリへ登録しない。外部3Dデータの取得、抽出、解析、ダウンロードは禁止する。
- ワークシートからmeasurement recordやcollision profileへ転記する際は別レビューを行い、ワークシートだけで`verified`へ昇格しない。

### sampled collision profile

- スロープとバンクのcollision profileは単一曲線式ではなく、長手方向stationの測定点列を正本とする。
- 標準stationは入口0%から出口100%まで5%刻みの21点とし、形状変化点には任意の追加stationを許可する。
- 手動採寸セッションの25%刻み等は基本視点、sampled collision profileの5%刻みは標準格子として区別し、未測定の標準stationは`unknown / null`で保持する。
- station位置は必須の`ratio`と、実測できた場合の`sMm`、バンク等で必要な`thetaDeg`を保持する。未確認値は`unknown / null`のままとする。
- station配列はratio昇順へ正規化し、入口0%と出口100%を必須とする。範囲外ratio、重複ID、逆順stationは検証エラーとする。
- 初期補間は既知の実測2点間だけの線形補間とし、unknown区間を外挿せず、明示的なunknown stationを飛び越えない。
- 補間値には方式と両側の測定station参照を付けて実測値と区別し、測定点列へ書き戻さない。
- 補間interfaceとprofile version／variantの選択は純粋関数で扱い、差し替え時も旧版と元測定点を変更しない。

### 疎な測定値の取り込みとreadiness

- 手動採寸値はMarkdownを自動解析せず、session、対象profile、測定者、測定日、証拠、tolerance、uncertaintyを持つ構造化入力としてdomain層へ渡す。
- 疎な測定stationは標準21 stationへ重ね、同じratioの標準unknownを置き換える。未測定項目は`unknown / null`、形状変化点は追加stationとして保持する。
- 取り込みは元入力、既存profile、標準stationを変更しない純粋関数とし、補間値を正本へ書き込まず、`verified`へ自動昇格しない。
- ratio比較には無次元の固定許容差`1e-10`を使い、浮動小数点表現差だけを正規化する。物理測定誤差や公差には使用しない。
- readinessはprofile statusと分離し、`structurally-valid`、`height-chain-ready`、`collision-ready`、`not-ready`を用途別に返す。不足時はstation IDと項目を列挙する。
- collision-readyの対象側壁はパーツの意味に応じて呼び出し側が指定し、全対象stationの走行面、下面、対象側壁、有効高さ・有効幅を必須とする。
- `unknown` profileはactive不可とし、`provisional` profileも指定用途のreadinessを満たす場合だけ用途指定APIでactiveにする。partial provisional profileをcollision-readyとして選択しない。

### 静的RC1版 lane-change正式表示（B案、2026-07-24）

- lane-changeの正式表示は、`lane-change-visual.js`の純粋な視覚モデルを正本とし、パレット、キャンバス、PNG出力で同じCanvas描画を使用する。
- RC1系の外形、3レーン境界、中央支持部、橋状のレーン切替部を独自ベクターで表現し、通常Straightの水平レーン線との二重描画は行わない。
- 静的RC1版で従来使用していた幅162cm、接続点`(-81, 0, 180°)`／`(81, 0, 0°)`、回転中心、配置ロジックは変更しない。今回の判断で新しい実寸・衝突・高さ情報は確定しない。
- Straight等との接続面には共通の`part-seams.js`を適用し、白抜けや物理的な隙間ではなく、接続済み境界へ通常幅0.52の線を1本だけ重ねる。
- 編集用SVGと高解像度PNGは正式視覚モデルへ同期する。画像は接続計算の正本にせず、geometryとコネクタは`part-catalog.js`で管理する。

### 静的RC1版 Burning Changer正式表示（2026-07-25）

- Mini4WD Online Track Editorの通常表示と既存RC1参照画像から、U字3レーン本体、内側1レーンの上層経路、組立単位の境界という形状要素だけを参考にし、コード・画像・素材はコピーせず独自ベクターで再構成する。
- 正式表示の正本は`burning-changer-visual.js`とし、パレット、配置前ゴースト、キャンバス、色変更、PNG出力で同じCanvas描画を使用する。
- 既存の180×144cm表示枠、回転中心、接続点`(-93, -54, 180°)`／`(-93, 54, 180°)`を維持する。今回の判断で実寸、Z高さ、collision profileは変更・確定しない。
- U字本体に7本、上層経路に4本の内部組立継ぎ目を通常幅0.52で常時表示する。外部パーツとの接続面は`part-seams.js`により1接続1本を追加し、白い隙間や二重線を作らない。
- 選択とhit-testは外接矩形ではなくU字本体と上層経路の形状を使用し、中央の空白を選択対象に含めない。PNG出力では選択強調を除外する。

### 複数接続・高さ階層・画面距離吸着（2026-07-25）

- 接続の正本を、端点の座標一致や「1コネクタ1接続」から、向きを正規化した複数connection edge配列へ変更する。同一edgeのA/B反転は同一とみなし、同じ物理コネクタを複数edgeが共有する状態は許可した上で警告する。
- 接続可否はパーツ種別の組み合わせ表ではなく、全標準コネクタ共通の方向、pitch、bank遷移、形状、レーン数メタデータから判定する。20度Bankの角度は高さ段数へ換算せず、`bankAngleDeg`として`zMm`から分離する。
- XYは静的版が既に用いるcmを維持し、高さの正本だけをmmの`zMm`とする。検証済みの1段115mmだけを定数化し、Slopeの低端`localZMm=0`／高端`localZMm=115`に使用する。未確認のSlope pitchや3D形状は推測しない。
- 吸着半径は画面上24pxとし、ワールド距離へズーム率を掛けて判定する。範囲外は自由配置とし、重なりや使用済み接続口を配置拒否理由にしない。吸着ON／OFF切替はレイアウト保存対象外とする。
- 高さ外形は暫定の共通コース本体高60mmを警告判定だけに使用し、collision profileの確定値にはしない。XY外形が重なっても高さ外形が離れていれば立体交差、重なれば「干渉の可能性」として表示し、自動移動・自動修正しない。
- 接続境界の継ぎ目は、edge両端のうち`zOrder`が上のパーツが所有し、そのパーツ本体の直後に描く。全パーツ描画後の最前面描画を廃止し、画面とPNGで同じ上下関係を使用する。
- 保存形式名とlocalStorageキーはRC2互換のまま維持し、`zMm`、`pitchDeg`、`bankAngleDeg`、`zOrder`、複数edgeを加算的に保存する。旧RC1／RC2にない値はアプリ適用時に0または既存配列順で補い、正常な旧データを破損扱いしない。

### 最終統合QAで確定した補足（2026-07-26）

- 使用済み接続口へ後挿入した20度BankからCorner連結群を組み直す場合、両端が同じbank姿勢を持つ通常パーツ群だけを接続先のbank角へ剛体として合わせる。20度Bank自身のように両端姿勢が異なる遷移パーツは固有姿勢を継承で上書きしない。
- グループ吸着で追加edgeを確定した直後にbank状態を再計算し、移動中の連結群全体へ同じ`bankAngleDeg`差分を適用する。XY相対位置、rotation、zMm、pitchDeg、内部edgeは変更しない。
- 同一XYに複数高さ候補がある場合、マウス移動中も右パネルへ全候補を更新表示し、利用者が高さを明示選択するまで配置を確定しない。
- 高さ干渉の警告はAABBの矩形では描画せず、通常の選択表示と同じ外周形状を赤線で描画する。警告線は通常の選択表示より前面に置き、内部レーン境界線とPNG出力には含めない。
- 正式edgeで接続された隣接パーツ同士の正常な接続面は干渉警告から除外する。高さedge不一致は座標を自動修正せず、「高さが閉合していません」と表示する。

### 45度コーナーの連続配置方向（2026-07-28）

- 45度コーナーの`right`／`left`は進行方向に対する意味値とし、接続口ID`a`／`b`とは別に管理する。画面上の絶対回転角から左右を推測しない。
- `lastPlacedCornerHandedness`とゴースト用の`cornerGhostHandedness`は配置支援専用のUIセッション状態とする。確定配置した45度コーナーだけが前者を更新し、ゴーストの方向変更、キャンセル、配置済みパーツの編集では更新しない。
- 次のゴーストは空き接続口の接線方向から姿勢を決め、その接続口に対応する`right`/`left`を適用する。通常回転の手動補正は方向変更時にも保持する。
- UIセッション状態はJSON、localStorage、Undo/Redo履歴へ保存しない。Undo/Redoはレイアウトだけを操作し、最後に確定したコーナー方向を巻き戻さない。ページ再読込と新規レイアウトでは標準の`right`から始める。

### 45度コーナーの両端吸着（2026-07-28）

- 右／左のコーナー方向と、既存コースへ接続する入口connectorを分離する。各方向で`a`と`b`のどちらも24px以内なら吸着候補に含め、選ばれた入口の反対側を次の出口とする。
- 同じ物理コーナーを反対端から使っても進行方向に対する右／左を維持するため、確定パーツには`entryConnectorId`と`cornerMirror`を保存する。これは配置済みパーツの接続・描画形状の値であり、`lastPlacedCornerHandedness`などのUIセッション状態ではない。
- ミラー状態はconnector座標・接線・外周描画・hit test・AABB・高さ干渉外周に同じ変換として適用する。JSON/localStorageには配置済みパーツの形状値のみを保存し、次コーナーの既定方向は保存・復元しない。

### 45度コーナー入口の自動選択（2026-07-28）

- ゴースト更新ごとに45度コーナーの入口connector `a` と `b` を両方生成し、接線・pitch・bank・高さ候補を満たすものだけの画面距離を比較する。`right`／`left`は各候補へ同じ意味値として適用し、入口の事前フィルタには使わない。
- 同一接続先へ複数の入口が届く場合は距離が最短の入口を採用する。距離が同じ場合は接続先endpointキー、次にconnector順で安定的に決定する。24px外なら自由配置とする。
- 入口A/Bは通常UIの選択項目にしない。高さが異なる接続先だけは従来どおり高さ候補を選べるが、選んだ接続先での入口は常に最短のものを自動採用する。ポインタ移動時は高さ候補の一時選択も解除し、前回配置した入口を次のゴーストへ引き継がない。

### 高速連続配置の実ポインタ操作とスタート出口（2026-07-30）

- 高速連続配置は実ポインタだけで操作する。OSポインタの移動・非表示、HTMLの仮想ポインタ、ガイド、フェード、ポインタロックは実装しない。`repeat`／`select`は接続アンカーを保つ。解除距離は当初70pxだったが、後述の同日決定で90pxへ更新した。
- Startは通常Straightと同じ形状・寸法を使うが、後方入口`a`と前方出口`b`を意味的なconnector roleとして明示する。スタート配置直後の初期アンカーは配列順・画面距離ではなく前方出口roleを必ず選ぶ。後方入口は通常の未接続コネクタとして残す。

### 高速配置の復旧・Start欠落・作成範囲判定（2026-07-30）

- 高速配置の`repeat`は0〜10px、`select`は10px超〜解除距離、`free`は解除距離超とする。解除距離は24pxの接続吸着半径とは別の`FAST_PATH_RELEASE_PX`で管理し、後述の同日決定で90pxへ更新した。
- Rで最後のパーツを戻す場合は、削除したパーツの接続相手を優先して新しい開放コネクタをactive anchorにし、カーソル・ゴースト種別・高速配置の物理ポインタ起点を同時に再構築する。Startだけが残る場合はStartの意味的な前方出口へ戻す。
- Startは通常のhit test、選択、範囲選択、移動、削除の対象にする。削除後は編集を止めず、canvasとwarning summaryへStart欠落を表示する。欠落中のStraightは右クリックのアプリ内メニューまたは選択パネルからStartへ変換でき、位置・回転・高さ・色・既存connector IDを保持する。
- 作成範囲外の最終判定は衝突判定と同じ`occupancyPolygon`を用いる。AABBは補助情報だけとし、曲線コーナーの中空部や回転矩形の余白を範囲外として警告しない。境界接触と1mm程度以下の数値誤差は範囲内とする。

### 高速配置の前方基準とRゴースト即時復旧（2026-07-30）

前方判定はゴースト出口のscreen座標を基準にし、出口と同位置からの左右選択も有効とする。後方（forwardが負）の入力だけを除外する。OSポインタの移動量は表示中ghost出口へ移して選択ポインタとし、解除距離には実ポインタ移動量、左右判定にはghost出口基準の選択ポインタを用いる。canvasのpointermoveで型が変化した場合は、そのイベント内で新しいghost proposalを生成して右パネルと描画へ同じstateを渡す。Rは削除対象のentry connectorに接続していたedgeを優先して前段anchorを復元する。Corner確定後の次anchorは、確定proposalのentry connector以外のworld connector（未接続出口）の位置・headingから取得する。
- 高速配置の解除距離は接続吸着半径・左右選択閾値から独立した`FAST_PATH_RELEASE_PX = 90`とする。90pxちょうどまでは高速配置を維持し、90pxを超えたときだけ`free`へ移行する。
- `select`の左右判定は接続アンカーや画面の絶対方向ではなく、現在表示中のゴーストの未接続側出口を基準にする。出口headingからforward/right軸を作り、出口と同位置または前方でlateralによる左・中央・右選択を有効にする。
- R復旧では、残存側connectorをactive anchorに設定した後、復元typeのfresh ghost proposalを同期的に生成する。描画や次のpointermoveに依存せず、R直後の再配置と連打復旧を可能にする。

### 45度コーナーの方向固定吸着（2026-07-28）

- 吸着候補は、ユーザーが選択中の`cornerGhostHandedness`を読み取り専用の固定条件として生成する。候補ごとに自動選択できるのは`entryConnectorId`、接続先、rotation、高さ、およびその方向を保つ`cornerMirror`だけであり、最短距離でも`right`／`left`を反転しない。
- 確定候補は`selectedHandedness`、`candidateHandedness`、`appliedHandedness`が一致する場合だけ配置する。不一致の変換候補は採用せず自由配置へ戻す。配置済みコーナーには形状値`entryConnectorId`／`cornerMirror`と整合する`cornerHandedness`を保存するが、次のゴーストのUIセッション方向はJSON、localStorage、Undo/Redoから復元しない。

### 45度コーナーの入口別姿勢計算（2026-07-29）

- 入口A/Bは既存コースへ接続する端だけを表す。候補生成では、選択中の右／左を固定したまま、各入口について鏡像あり／なしの物理変換を接続先endpointの接線方向ごとに評価する。
- 候補の回転角は、変換後の入口接線が接続先接線の反対向きになるよう毎回算出する。入口IDから固定のrotationやcornerMirrorを返さず、古い候補rotationは接線互換でない限り再利用しない。
- 入口A/B、targetTangent、candidateRotation、cornerMirrorは候補の別々の値として扱う。利用者が選んだhandednessは候補比較・配置確定の間、読み取り専用で維持する。
