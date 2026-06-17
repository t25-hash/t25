/* NSCode Ask engine — a small but REAL RAG over your own documents, offline.
 * Pipeline: your docs -> chunk -> TF-IDF cosine retrieve -> train a tiny
 * in-browser n-gram LM on the retrieved context -> GENERATE an answer by
 * next-token prediction (NSCode.babyLLM). Retrieval is real (NSCode.rag);
 * generation is a baby-level statistical LM (no neural net, no API). KB is
 * persisted. The default KB is a Japanese knowledge base aimed at PLANT
 * ENGINEERS: it explains every lab/topic in the platform with plant-domain
 * framing (P&ID / DCS / 運転手順書 / 保全履歴 / HAZOP …). */
(function (NSCode) {
  'use strict';
  var store = NSCode.store;

  /* Default knowledge base (Japanese, plant-engineer oriented). One doc per
   * sidebar topic so Ask can answer about any part of the platform, grounded
   * in plant-engineering examples. Users can replace these from the UI. */
  var DEFAULT_DOCS = [
    { name: '00-プラントエンジニアリング基礎.md', text:
      'プラントエンジニアリングは、化学・石油・発電・上下水などの設備を設計・調達・建設・試運転し、安全に運転・保全する技術分野です。\n\n' +
      '主要な技術文書には、P&ID（配管計装図）、PFD（プロセスフロー図）、機器仕様書、運転手順書（SOP）、HAZOP 記録、設備保全履歴、検査記録、トラブル報告書があります。\n\n' +
      '計装・制御では、DCS（分散制御システム）や SCADA が各機器のセンサ値（温度・圧力・流量・液位）を収集し、運転員が監視・操作します。\n\n' +
      'これらの大量の技術文書とデータを、AI エージェントの技術（検索・要約・推論）で活用するのが、このプラットフォームの狙いです。各機能はプラント業務の文脈で学べます。' },
    { name: '01-RAG-運転手順書の活用.md', text:
      'RAG（検索拡張生成）は、社内の技術文書を検索してプロンプトに根拠として注入し、回答の事実性を高める手法です。プラントでは運転手順書・設計図書・過去トラブル事例の活用に向きます。\n\n' +
      'まず文書をチャンク（一定長の断片）に分割し、各チャンクをベクトル化して索引します。質問が来たら、質問に近いチャンクを類似度で取り出します。\n\n' +
      '取り出したチャンクをコンテキストとしてプロンプトに入れ、その範囲だけを根拠に回答させます。これにより、最新の改訂手順書や設備固有の情報にも答えられます。\n\n' +
      'チャンクサイズが大きすぎると無関係な情報が混ざり、小さすぎると文脈が切れます。オーバーラップを設けると手順の前後関係が保たれます。プラント文書は図表が多いため、表は行単位、手順は番号単位で区切ると精度が上がります。' },
    { name: '02-Embedding-類似事例検索.md', text:
      '埋め込み（Embedding）は、テキストを意味を表す数値ベクトルに変換する技術です。設備名や不具合の記述をベクトル化すると、表現が違っても意味の近い過去事例を検索できます。\n\n' +
      'たとえば「ポンプの軸振動が大きい」と「P-101 のベアリング異音」は語が違っても、ベクトル空間では近くに配置され、関連する保全記録を引き当てられます。\n\n' +
      '類似度はコサイン類似度・ユークリッド距離・内積で測ります。次元削減（PCA）で 2 次元に投影すると、設備や不具合の分布を目で確認できます。' },
    { name: '03-検索チューニング.md', text:
      '検索の品質はパラメータで大きく変わります。チャンクサイズ、オーバーラップ、取得件数（TopK）、再ランク、閾値が主要な調整項目です。\n\n' +
      'TopK を増やすと根拠は増えますが、無関係な断片も混じります。MMR 再ランクは、関連度と多様性のバランスを取り、似た断片の重複を避けて広い文脈を集めます。\n\n' +
      '閾値を設けると、関連度の低い断片を除外できます。プラントの安全に関わる回答では、根拠が閾値を超えなければ「該当資料なし」と答えさせ、ハルシネーション（作話）を防ぎます。' },
    { name: '04-Agent-運転支援.md', text:
      'エージェントは観察・思考・行動のループを回し、ツールを使ってタスクを達成します。プラントでは、アラーム発生時に関連タグの傾向を調べ、過去の類似トラブルを検索し、対応案を提示する用途が考えられます。\n\n' +
      '計画を立て、行動し、結果を観察し、必要なら計画を修正して再試行します。失敗時はリトライ（指数バックオフ）で再実行します。\n\n' +
      'RAG はエージェントの「知識を調べる」行動として組み込めます。エージェント自身は判断を行い、検索・計算・記録などの実作業はツールに委ねます。' },
    { name: '05-ツール利用-計装データ連携.md', text:
      'ツール利用（Tool Calling）は、LLM が外部の機能を呼び出す仕組みです。LLM 自身は文章を生成するだけなので、DCS タグの読み取り、計算、文書検索などは外部ツールに任せます。\n\n' +
      'モデルはゴールに対して、どのツールをどんな引数で呼ぶかを選び、その選択理由とともに実行します。実行ログを残すことで、判断の追跡と監査ができます。\n\n' +
      'プラントの安全上、書き込み系の操作（設定変更・起動停止）は権限ゲートで人の承認を挟むのが基本です。' },
    { name: '06-MCP-標準接続.md', text:
      'MCP（Model Context Protocol）は、ツールやリソースを標準プロトコルで公開する仕組みです。システムごとに個別実装する代わりに、共通の作法で接続できます。\n\n' +
      'サーバー側はツール（実行できる操作）、リソース（読み取れるデータ）、プロンプト（定型の指示）を定義します。クライアントは config に従って接続し、JSON-RPC でハンドシェイクします。\n\n' +
      'プラントでは、保全管理システムや図面リポジトリを MCP サーバーとして公開すれば、エージェントから標準手順で参照できます。' },
    { name: '07-Memory-記憶と保全履歴.md', text:
      'エージェントの記憶には、短期記憶（直近のやり取り）、長期記憶（恒久的な知識）、意味記憶（概念）、エピソード記憶（出来事）があります。\n\n' +
      '会話や調査が長くなると文脈が膨らむため、圧縮や要約で重要点だけを残します。想起はコサイン類似度で、今の状況に近い過去の記憶を引き出します。\n\n' +
      'プラントでは、点検・保全の履歴を長期記憶として蓄積し、同種の不具合が起きたときに過去の対応を想起させる使い方が有効です。' },
    { name: '08-MultiAgent-設計レビュー.md', text:
      'マルチエージェントは、役割の異なる複数のエージェント（Manager / Planner / Coder / Reviewer など）が協調してタスクを進める構成です。\n\n' +
      'マネージャが全体を統括し、サブタスクを各担当へ割り当て、進捗と統合を管理します。意見が割れる場合は投票で合意を形成します。\n\n' +
      'プラントの設計レビューに見立てると、プロセス・配管・計装・安全の各視点を別々のエージェントが担当し、相互チェックで抜け漏れを減らす狙いになります。' },
    { name: '09-ClaudeCode-エージェントの構造.md', text:
      'Claude Code に代表されるコーディングエージェントの中核は、while ループ・権限ゲート・ツール・コンテキスト（セッションとメモリ）です。\n\n' +
      'モデルが次の行動を決め、ツールを実行し、結果を文脈に追記して、また次の行動を決める——この繰り返しでタスクを進めます。AI（モデル呼び出し）が占める部分はごく僅かで、大半は権限管理やツール実行などの周辺の仕組み（インフラ）です。\n\n' +
      '危険な操作の前には権限ゲートで承認を求めます。プラントの自動化でも、この「人の承認を挟む」という設計思想が、そのまま安全設計に通じます。' },
    { name: '10-Evaluation-評価指標.md', text:
      '検索や回答の品質は、感覚ではなく指標で測ります。ラベル付きデータセットを用意し、Precision@k（取得した上位 k 件のうち正解の割合）と Recall@k（正解のうち取得できた割合）で評価します。\n\n' +
      'Precision が低ければ無関係な断片が混ざっており、Recall が低ければ必要な根拠を取りこぼしています。両者はトレードオフの関係にあります。\n\n' +
      'プラント文書のように専門用語が多い領域では、用語辞書や同義語の整備が評価値の改善に効きます。' },
    { name: '11-Playground-プロンプト設計.md', text:
      'プロンプト設計は、モデルから良い出力を引き出す基本技術です。役割・前提・指示・出力形式・制約を明確に書き、曖昧さを減らします。\n\n' +
      '温度（Temperature）は出力のランダム性です。低いと決定的で安定し、高いと多様で創造的になります。手順書の生成など正確さが要る場面では低めにします。\n\n' +
      'トークン数はコストと文脈長の制約に直結します。送信前にトークン数を見積もり、不要な前置きを削ると安定します。' },
    { name: '12-DocGen-帳票生成.md', text:
      '文書生成（Doc 生成）は、プロンプトから Excel・Word・CSV・Markdown を組み立てる機能です。「列: 機器番号, 点検項目, 判定」「20 行」「# 見出し」「- 箇条書き」といった指示を解釈して表や文書を作ります。\n\n' +
      'プラントでは、点検表・部品リスト・不具合一覧などの定型帳票の雛形づくりに使えます。解釈は決定論的で、出力ファイルは実体のある本物です。' },
    { name: '13-Research-PDF解析.md', text:
      '技術資料の多くは PDF です。Research では、PDF を端末内で解析し、テキスト抽出・要約（TextRank）・キーワード抽出（TF-IDF）・抽出型 QA・文書内検索ができます。外部送信は行いません。\n\n' +
      '分厚い設計図書や仕様書から要点を素早く把握し、必要な箇所を質問で引き当てる、といった調査に向きます。' },

    /* --- 廃棄物発電施設（タービン＋ボイラ）ナレッジ --- */
    { name: '20-廃棄物発電の概要.md', text:
      '廃棄物発電（WtE: Waste to Energy）は、ごみを焼却した熱で高温高圧の蒸気をつくり、その蒸気で蒸気タービンを回して発電する仕組みです。廃熱ボイラ・蒸気タービン・発電機を備えるのが基本構成です。\n\n' +
      '回収したごみはごみピットに貯留し、クレーンで焼却炉へ投入します。焼却で発生した高温の燃焼ガスは廃熱ボイラで蒸気に変えられ、蒸気タービンを回して発電機で電気を起こします。\n\n' +
      'このように熱を動力・電気に変換するサイクルをランキンサイクルと呼びます。発電後の余熱は地域熱供給や場内利用にも使われます。\n\n' +
      '一般廃棄物を直接燃焼する国内の発電効率は 20 数 % 程度で、廃棄物組成が安定する欧州では 30 % 程度に達する例もあります。' },
    { name: '21-焼却炉-ストーカ式と流動床式.md', text:
      'ごみ焼却炉には、ストーカ式・流動床式・回転炉式などがあります。最も普及しているのはストーカ式です。\n\n' +
      'ストーカ式は、可動火格子（ストーカ）の上でごみを移動させながら、火格子下部から燃焼空気を送って焼却します。処理は「乾燥 → 燃焼 → 後燃焼（おき燃焼）」の 3 過程で進みます。\n\n' +
      '流動床式は、砂を充填した炉に空気を吹き込んで砂を流動状態にし、そこへごみを投入して熱分解・燃焼させます。竪型炉のため省スペース化しやすい特徴があります。\n\n' +
      'ダイオキシン類の生成を抑えるため、850℃ 以上の温度・2 秒以上の滞留時間・燃焼ガスの十分な攪拌（3T: 温度・時間・乱流）を確保し、完全燃焼を維持します。' },
    { name: '22-廃熱ボイラと過熱器.md', text:
      '廃熱ボイラは、焼却で生じた高温の燃焼ガスから熱を回収し、水を蒸気に変える熱交換器です。炉壁を水管構造（水冷壁）とすることで炉の腐食を抑え、耐久性を高めています。\n\n' +
      'ボイラで発生した飽和蒸気は、過熱器でさらに加熱されて過熱蒸気となり、タービンへ送られます。蒸気条件（温度・圧力）を高めるほど発電効率は上がります。\n\n' +
      'ただし、ごみに含まれる塩素分により、飛灰と塩化水素ガスによる高温腐食（塩化物腐食）が過熱器で起こりやすく、これが蒸気温度の上限を制約します。\n\n' +
      'このため多くの施設では過熱蒸気温度を約 400℃ に抑えてタービンを回し、腐食と効率のバランスを取っています。高温化には耐食材料や高温腐食対策が必要です。' },
    { name: '23-蒸気タービンと発電機.md', text:
      '蒸気タービンは、過熱蒸気の圧力エネルギーを回転運動に変える機械で、同軸の発電機を回して発電します。\n\n' +
      '復水タービンは、排気を復水器で真空に近い低圧まで膨張させてから凝縮させる方式で、発電量を最大化できます。背圧タービンは復水器を持たず、仕事をした後の排気蒸気を工場用などに利用します。\n\n' +
      '抽気復水タービンは、タービン中段から低圧の蒸気を抽気して給水加熱や脱気に使い、最終段の排気は復水器で復水に戻します。熱を有効利用しながら発電する方式です。\n\n' +
      'タービンの運転では、軸振動・軸受温度・回転数・蒸気条件の監視が重要で、振動増大や軸受異常は早期に検知して対応します。' },
    { name: '24-復水器と給水系統.md', text:
      '復水器は、タービンで仕事を終えた排気蒸気を冷却・凝縮して水（復水）に戻す大型の熱交換器です。内部を真空に保つことでタービン排気側の圧力を下げ、発電効率を高めます。\n\n' +
      '凝縮した復水は復水ポンプで送られ、脱気器で溶存酸素を除去してから、給水ポンプでボイラへ戻されます。脱気は配管やボイラの腐食を防ぐために重要です。\n\n' +
      'タービンの抽気蒸気を給水加熱器や脱気器の加熱に使うサイクルを再生サイクルと呼び、純水と熱の損失を最小化して効率を高めます。\n\n' +
      '給水・ボイラ水の水質管理（pH・電気伝導率・溶存酸素）は、スケールや腐食を防ぐ運転管理の基本です。' },
    { name: '25-排ガス処理.md', text:
      'ごみ焼却で生じる排ガスには、ばいじん（飛灰）、塩化水素や硫黄酸化物などの酸性ガス、窒素酸化物（NOx）、水銀、ダイオキシン類などが含まれます。これらを基準値以下に処理してから煙突へ排出します。\n\n' +
      'バグフィルタ（ろ過式集じん器）はばいじんを捕集します。前段で消石灰などの乾式吸着剤注入（DSI）や活性炭注入（ACI）を行うと、酸性ガス・水銀・ダイオキシン類も同時に除去できます。\n\n' +
      '窒素酸化物は、触媒脱硝（SCR）や無触媒脱硝（SNCR）で低減します。触媒脱硝は、ばいじんを除いたバグフィルタの後段に設置されることが多いです。\n\n' +
      'ダイオキシン類は、完全燃焼の維持（850℃ 以上・2 秒以上）と、排ガスの急冷による再合成防止で抑制します。' },
    { name: '26-運転と保全.md', text:
      '廃棄物発電施設の運転は、ごみ受入 → 焼却 → 熱回収 → 発電 → 排ガス処理 → 灰処理の一連を 24 時間連続で管理します。全連続式の施設では安定燃焼が効率と排ガス品質の鍵になります。\n\n' +
      'ボイラでは、伝熱面へのダスト付着（クリンカ・スーティング）を抑えるため、スートブロワで定期的に灰を除去します。過熱器や水冷壁の減肉・腐食は点検で監視します。\n\n' +
      'タービン系では、軸振動・軸受温度・復水器の真空度・潤滑油の状態を監視し、異常の予兆を早期に捉えます。振動増大時は予備設備への切替や計画停止で点検します。\n\n' +
      'ごみピットは可燃性で、自然発火による火災・粉じん爆発のリスクがあるため、温度監視・消火設備・適切な攪拌と払い出しで予防します。' },
    { name: '27-効率と指標.md', text:
      '廃棄物発電の性能は、発電効率（投入した廃棄物の熱量に対する発電電力量の割合）や熱回収率で評価します。高効率ごみ発電では、蒸気条件の高温高圧化や復水・再生サイクルの工夫で効率を高めます。\n\n' +
      '発電した電力は場内で使うほか、余剰分を売電します。発電に加えて、蒸気や温水を地域熱供給・温水プール・園芸施設などに供給する余熱利用も行われます。\n\n' +
      '効率を左右する主因は、ごみの質（発熱量・水分）と量の安定、蒸気条件、復水器の真空度、そして設備の健全性です。\n\n' +
      '環境省の高効率ごみ発電施設整備の考え方では、安定した連続運転と熱回収の最大化が重視されます。' },
    { name: '28-安全とトラブル.md', text:
      '廃棄物発電施設の安全管理では、HAZOP などの体系的なリスク評価で、設備のハザードと運転性の問題を洗い出します。\n\n' +
      '代表的なトラブルには、過熱器の高温腐食による減肉・漏洩、ボイラ伝熱面へのダスト付着、タービンの軸振動・軸受損傷、復水器の真空度低下、給水水質悪化によるスケール・腐食があります。\n\n' +
      'ごみピットでの火災・粉じん爆発は重大リスクで、温度監視・消火設備・適切なごみの攪拌により予防します。\n\n' +
      'いずれも、予兆の早期検知（振動・温度・差圧・水質の監視）と、予備機への切替や計画停止での点検・補修が基本対応です。過去のトラブル事例は保全履歴として蓄積し、再発防止に活用します。' },

    /* --- 機械工学（概説・設計・パルプ紙/繊維機械）要約 --- */
    { name: '30-機械工学の基礎.md', text:
      '機械（machine）とは、動力を受け取り、拘束された相対運動を通じて有用な仕事を行う装置の総称です。複数の部品が一定の拘束のもとで動き、入力（動力）を目的の運動・力・仕事へ変換します。\n\n' +
      '機械工学は、機械の設計・製作・運転に関わる工学分野で、材料力学・機構学・熱力学・流体力学・制御工学などを基礎にします。\n\n' +
      '機械を構成する基本部品を機械要素と呼びます。ねじ・ボルト、軸、軸受、歯車、ベルトやチェーン、ばね、軸継手、カム、リンク機構などがあり、動力の伝達・変換・支持を担います。\n\n' +
      'プラント設備（ポンプ・送風機・熱交換器・タービン）も、これら機械要素と機械工学の原理の上に成り立っています。' },
    { name: '31-機械設計の基礎.md', text:
      '設計とは、求められる機能を満たすものを構想し、形状・寸法・材料・公差として具体化する行為です。要求仕様の明確化に始まり、概念設計 → 基本設計 → 詳細設計と段階的に詳細化します。\n\n' +
      '設計では、強度・剛性・安全率、製造のしやすさ、コスト、保全性、安全性などを総合的に満たすよう、トレードオフを取りながら最適化します。\n\n' +
      '材料力学では、応力とひずみ、引張・圧縮・せん断・曲げ・ねじりの各荷重、許容応力と安全率に基づいて部材の寸法を決めます。疲労・座屈・クリープといった破壊形態も考慮します。\n\n' +
      '材料選定では、機械的性質（強度・延性・硬さ）、耐食性・耐熱性、加工性、コストを用途に応じて比較します。' },
    { name: '32-パルプ紙・繊維機械.md', text:
      'パルプ・製紙機械は、木材などの原料からパルプをつくり、紙へ抄き上げる一連の設備です。\n\n' +
      '調木・チップ工程では、原木の樹皮をバーカ（barker）で除去し、チッパで木材をチップに切削します。樹皮はパルプ歩留りの低下やちりの原因になるため除去します。ドラムバーカは、やや傾けて回転するドラム内で丸太同士やドラム壁との摩擦により樹皮を剥ぎ取ります。\n\n' +
      'パルプ化・洗浄・漂白を経たパルプは、抄紙機（ワイヤパートで脱水、プレスパートで搾水、ドライヤパートで乾燥）を通って連続した紙になります。\n\n' +
      '繊維機械は、紡績（開繊・カード・練条・粗紡・精紡）や織布などで、繊維を糸や布へ加工する設備群です。' }
  ];

  function getDocs() { return store.get('ask.docs', DEFAULT_DOCS); }
  function setDocs(docs) { store.set('ask.docs', docs); }
  function resetDocs() { store.set('ask.docs', DEFAULT_DOCS); return DEFAULT_DOCS; }

  /* clean PDF/extracted text before the net learns it: normalize unicode
   * (NFKC: full-width→ASCII, half-width kana→full), drop bare page-number
   * lines and obvious header/footer noise, collapse whitespace. Big quality
   * win for messy PDF text. */
  function cleanText(t) {
    t = String(t || '');
    try { t = t.normalize('NFKC'); } catch (e) {}
    t = t.replace(/\r\n?/g, '\n');
    t = t.split('\n').filter(function (line) {
      var s = line.trim();
      if (!s) return false;
      if (/^[-–—\s]*\d{1,4}[-–—\s]*$/.test(s)) return false;       // bare page number
      if (/^(?:page|p\.?|ページ|第)\s*\d+/i.test(s) && s.length < 12) return false; // short page markers
      return true;
    }).join('\n');
    return t.replace(/[ \t　]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* lexical features for sentence ranking: latin words + CJK character bigrams
   * (mirrors NSCode.research.terms so query/sentence overlap is meaningful for
   * Japanese, where there are no spaces between words). */
  function gram(t) {
    var g = (t.toLowerCase().match(/[a-z][a-z0-9\-]{1,}/g) || []);
    var cjk = t.match(/[぀-ヿ一-鿿ｦ-ﾟ]/g) || [];
    for (var i = 0; i < cjk.length - 1; i++) g.push(cjk[i] + cjk[i + 1]);
    return g;
  }

  /* chunk every doc, tagging each chunk with its source document name */
  function buildChunks(docs) {
    var all = [];
    docs.forEach(function (d) {
      NSCode.rag.chunk(d.text || '', { size: 320, overlap: 60, separator: '\n\n' })
        .forEach(function (c) { all.push({ id: all.length, text: c.text, source: d.name }); });
    });
    return all;
  }

  /* COMPOSE a natural-language answer from the passages behind the top hits.
   * Ranks the WHOLE sentences of those source documents (not the overlapping
   * chunk windows, which can start mid-word) by lexical overlap + semantic
   * similarity to the question, then returns the best few, deduped. The result
   * is real sentences from the docs, so it is always grammatical Japanese —
   * the reliable answer a tiny neural LM cannot form on its own. */
  function composeAnswer(query, hits, docs, max) {
    var emb = NSCode.embeddings, qv = emb.embed(query, 64);
    var hitSources = {};
    hits.forEach(function (h) { hitSources[h.chunk.source] = 1; });
    // drop Markdown heading lines (titles / breadcrumbs) before splitting into
    // sentences — otherwise a heading with no 。 gets glued onto the next
    // sentence and the answer comes out littered with "# 1・2・13 …" prefixes.
    var poolText = docs.filter(function (d) { return hitSources[d.name]; })
                       .map(function (d) { return d.text; }).join('\n\n')
                       .replace(/^[ \t]*#{1,6}[ \t]+.*$/gm, '');
    var poolSents = NSCode.research.splitSentences(poolText)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 6; });
    var qg = {}; gram(query).forEach(function (x) { qg[x] = 1; });
    var ranked = poolSents.map(function (s) {
      var gs = gram(s), m = 0; gs.forEach(function (x) { if (qg[x]) m++; });
      var lex = gs.length ? m / Math.sqrt(gs.length) : 0;
      return { s: s, score: lex + 0.25 * emb.cosine(qv, emb.embed(s, 64)) };
    }).sort(function (a, b) { return b.score - a.score; });
    var answer = [], lim = max || 3;
    for (var ai = 0; ai < ranked.length && answer.length < lim; ai++) {
      if (ranked[ai].score <= 0) break;
      var cand = ranked[ai].s;
      if (!answer.some(function (p) { return p.indexOf(cand) >= 0 || cand.indexOf(p) >= 0; })) answer.push(cand);
    }
    return answer;
  }

  /* ask a question over the docs, the Claude Code way (RAG → compose → show how
   * generation works):
   *   1. retrieve relevant chunks (TF-IDF cosine)
   *   2. COMPOSE the answer from the retrieved passages — pick the sentences that
   *      best match the question. These are real sentences from the docs, so the
   *      answer is always natural language (a tiny n-gram LM alone cannot reliably
   *      form grammatical sentences; composing from retrieval is the missing step).
   *   3. also train a baby n-gram LM and GENERATE, kept as an educational demo of
   *      next-token prediction.
   * Returns { answer, generated, seed, trace, hits, prompt }. */
  function ask(query, opts) {
    opts = opts || {};
    var docs = opts.docs || getDocs();
    var chunks = buildChunks(docs);
    if (!chunks.length || !query) return null;
    var res = NSCode.rag.retrieve(query, chunks, { topK: opts.topK || 4, threshold: 0 });
    var emb = NSCode.embeddings, qv = emb.embed(query, 64);
    var L = NSCode.babyLLM;

    // (2) compose a natural-language answer from the passages behind the hits.
    var answer = composeAnswer(query, res.hits, docs);

    // training text: whole corpus + retrieved context (context weighted x3 so the
    // generated answer is grounded in what was retrieved for THIS question).
    // order 4 gives the baby LM longer memory -> more fluent, on-topic Japanese.
    var contextText = res.hits.map(function (h) { return h.chunk.text; }).join('\n');
    var corpusText = docs.map(function (d) { return d.text; }).join('\n');
    var model = L.train(corpusText + '\n' + contextText + '\n' + contextText + '\n' + contextText, 4);

    // seed: the opening tokens of the most query-relevant sentence (keeps it on-topic).
    // a slightly longer seed (4 tokens) anchors the answer to a real sentence start.
    var sents = NSCode.research.splitSentences(contextText);
    sents.sort(function (a, b) { return emb.cosine(qv, emb.embed(b, 64)) - emb.cosine(qv, emb.embed(a, 64)); });
    var seedSent = sents[0] || query;
    var seedToks = L.tokenize(seedSent).slice(0, 4);
    if (!seedToks.length) seedToks = L.tokenize(query).slice(0, 4);

    // fallback: if no sentence shared a query term, answer with the most
    // semantically similar retrieved sentence so the answer is never empty.
    if (!answer.length && sents[0]) answer = [sents[0]];

    // repetitionPenalty discourages the loops a tiny n-gram model falls into.
    var genOpts = { temperature: opts.temperature == null ? 0.8 : opts.temperature, topK: opts.topK2 || 8,
      maxTokens: opts.maxTokens || 60, repetitionPenalty: opts.repetitionPenalty || 1.4 };
    var gen = L.generate(model, seedToks, genOpts);

    return {
      answer: answer,
      generated: L.join(gen),
      seed: L.join(seedToks),
      trace: L.trace(model, seedToks, 5, genOpts),
      vocab: model.vocab,
      hits: res.hits, chunks: chunks,
      prompt: NSCode.rag.buildContext(res.hits, null, query)
    };
  }

  /* HYBRID answer (search + weights) — the Claude-style pipeline that scales to
   * large knowledge bases / PDFs:
   *   1. SEARCH: retrieve the chunks most relevant to the question (TF-IDF).
   *   2. WEIGHTS: train a small neural net on just those chunks (fast & focused),
   *      then generate the answer from its weights, seeded by the question.
   * Only the retrieved chunks are learned, so KB size doesn't blow up cost.
   * Returns a Promise of { text, seed, hits, loss }. */
  function hybridAnswer(question, opts) {
    opts = opts || {};
    var chunks = buildChunks(getDocs());
    if (!chunks.length || !question) return Promise.resolve(null);
    var res = NSCode.rag.retrieve(question, chunks, { topK: opts.topK || 4, threshold: 0 });
    if (!res.hits.length) return Promise.resolve({ text: '', seed: '', hits: [] });
    var context = res.hits.map(function (h) { return h.chunk.text; }).join('\n');
    var L = NSCode.neuralLM;
    var m = L.create(context, { context: 4, dim: 20, hidden: 48, maxVocab: 400 });
    // extractive answer from the retrieved passages — the reliable, grammatical
    // reply shown as the main answer (the neural generation is a learning demo).
    var compose = composeAnswer(question, res.hits, getDocs());
    return L.trainAsync(m, { steps: opts.steps || 5000, chunk: 1250, lr: 0.18, onProgress: opts.onProgress })
      .then(function () {
        var a = L.answer(m, question, { temperature: opts.temperature == null ? 0.45 : opts.temperature, candidates: opts.candidates || 14, maxTokens: 52 });
        return { text: a.text, seed: a.seed, compose: compose, hits: res.hits, loss: m.loss };
      });
  }

  NSCode.askEngine = {
    DEFAULT_DOCS: DEFAULT_DOCS,
    getDocs: getDocs, setDocs: setDocs, resetDocs: resetDocs, cleanText: cleanText,
    buildChunks: buildChunks, ask: ask, hybridAnswer: hybridAnswer
  };
})(window.NSCode);
