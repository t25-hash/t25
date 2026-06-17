/* NSCode Ask engine — a small but REAL RAG over your own documents, offline.
 * Pipeline: your docs -> chunk -> TF-IDF cosine retrieve -> train a tiny
 * in-browser n-gram LM on the retrieved context -> GENERATE an answer by
 * next-token prediction (NSCode.babyLLM). Retrieval is real (NSCode.rag);
 * generation is a baby-level statistical LM (no neural net, no API). KB is
 * persisted. The default fallback KB is a Japanese knowledge base on MECHANICAL
 * ENGINEERING (機械工学): it explains every lab/topic in the platform with
 * mechanical-engineering framing (機械要素 / 歯車 / 軸受 / 材料力学 …). The
 * primary Ask source is the prebuilt 機械工学 index (assets/kb); this set is the
 * small offline fallback used by "自分の知識" mode and Neural Lab training. */
(function (NSCode) {
  'use strict';
  var store = NSCode.store;

  /* Default knowledge base (Japanese, mechanical-engineering oriented). One doc
   * per sidebar topic so Ask can answer about any part of the platform, grounded
   * in mechanical-engineering examples. Users can replace these from the UI. */
  var DEFAULT_DOCS = [
    { name: '00-機械工学エンジニアリング基礎.md', text:
      '機械工学は、機械や構造物を設計・製作・運転・保全する技術分野で、材料力学・機構学・熱力学・流体力学・制御工学などを基礎にします。\n\n' +
      '主要な技術文書には、設計仕様書、部品図・組立図、強度計算書、部品表（BOM）、検査記録、保全マニュアル、不具合報告書があります。\n\n' +
      '設計や検証では、CAD（設計）、CAE（解析）、PLM（製品ライフサイクル管理）が、寸法・材料・公差や応力・たわみといった情報を扱い、技術者が判断します。\n\n' +
      'これらの大量の技術文書とデータを、AI エージェントの技術（検索・要約・推論）で活用するのが、このプラットフォームの狙いです。各機能は機械設計・機械工学の文脈で学べます。' },
    { name: '01-RAG-技術文書の活用.md', text:
      'RAG（検索拡張生成）は、社内の技術文書を検索してプロンプトに根拠として注入し、回答の事実性を高める手法です。機械分野では設計基準・仕様書・過去不具合事例の活用に向きます。\n\n' +
      'まず文書をチャンク（一定長の断片）に分割し、各チャンクをベクトル化して索引します。質問が来たら、質問に近いチャンクを類似度で取り出します。\n\n' +
      '取り出したチャンクをコンテキストとしてプロンプトに入れ、その範囲だけを根拠に回答させます。これにより、最新の改訂基準や部品固有の情報にも答えられます。\n\n' +
      'チャンクサイズが大きすぎると無関係な情報が混ざり、小さすぎると文脈が切れます。オーバーラップを設けると説明の前後関係が保たれます。設計図書は図表が多いため、表は行単位、手順は番号単位で区切ると精度が上がります。' },
    { name: '02-Embedding-類似事例検索.md', text:
      '埋め込み（Embedding）は、テキストを意味を表す数値ベクトルに変換する技術です。部品名や不具合の記述をベクトル化すると、表現が違っても意味の近い過去事例を検索できます。\n\n' +
      'たとえば「歯車のかみ合い騒音が大きい」と「ギヤの歯面ピッチング」は語が違っても、ベクトル空間では近くに配置され、関連する設計・不具合記録を引き当てられます。\n\n' +
      '類似度はコサイン類似度・ユークリッド距離・内積で測ります。次元削減（PCA）で 2 次元に投影すると、部品や不具合の分布を目で確認できます。' },
    { name: '03-検索チューニング.md', text:
      '検索の品質はパラメータで大きく変わります。チャンクサイズ、オーバーラップ、取得件数（TopK）、再ランク、閾値が主要な調整項目です。\n\n' +
      'TopK を増やすと根拠は増えますが、無関係な断片も混じります。MMR 再ランクは、関連度と多様性のバランスを取り、似た断片の重複を避けて広い文脈を集めます。\n\n' +
      '閾値を設けると、関連度の低い断片を除外できます。強度や安全に関わる回答では、根拠が閾値を超えなければ「該当資料なし」と答えさせ、ハルシネーション（作話）を防ぎます。' },
    { name: '04-Agent-設計支援.md', text:
      'エージェントは観察・思考・行動のループを回し、ツールを使ってタスクを達成します。機械分野では、不具合発生時に関連部品の図面や仕様を調べ、過去の類似事例を検索し、対策案を提示する用途が考えられます。\n\n' +
      '計画を立て、行動し、結果を観察し、必要なら計画を修正して再試行します。失敗時はリトライ（指数バックオフ）で再実行します。\n\n' +
      'RAG はエージェントの「知識を調べる」行動として組み込めます。エージェント自身は判断を行い、検索・計算・記録などの実作業はツールに委ねます。' },
    { name: '05-ツール利用-設計データ連携.md', text:
      'ツール利用（Tool Calling）は、LLM が外部の機能を呼び出す仕組みです。LLM 自身は文章を生成するだけなので、寸法・物性値の参照、強度計算、文書検索などは外部ツールに任せます。\n\n' +
      'モデルはゴールに対して、どのツールをどんな引数で呼ぶかを選び、その選択理由とともに実行します。実行ログを残すことで、判断の追跡と監査ができます。\n\n' +
      '設計変更を伴う書き込み系の操作（図面更新・部品表変更）は、権限ゲートで人の承認を挟むのが基本です。' },
    { name: '06-MCP-標準接続.md', text:
      'MCP（Model Context Protocol）は、ツールやリソースを標準プロトコルで公開する仕組みです。システムごとに個別実装する代わりに、共通の作法で接続できます。\n\n' +
      'サーバー側はツール（実行できる操作）、リソース（読み取れるデータ）、プロンプト（定型の指示）を定義します。クライアントは config に従って接続し、JSON-RPC でハンドシェイクします。\n\n' +
      '機械分野では、部品データベースや図面リポジトリを MCP サーバーとして公開すれば、エージェントから標準手順で参照できます。' },
    { name: '07-Memory-記憶と不具合履歴.md', text:
      'エージェントの記憶には、短期記憶（直近のやり取り）、長期記憶（恒久的な知識）、意味記憶（概念）、エピソード記憶（出来事）があります。\n\n' +
      '会話や調査が長くなると文脈が膨らむため、圧縮や要約で重要点だけを残します。想起はコサイン類似度で、今の状況に近い過去の記憶を引き出します。\n\n' +
      '機械分野では、設計判断や不具合対策の履歴を長期記憶として蓄積し、同種の不具合が起きたときに過去の対応を想起させる使い方が有効です。' },
    { name: '08-MultiAgent-設計レビュー.md', text:
      'マルチエージェントは、役割の異なる複数のエージェント（Manager / Planner / Coder / Reviewer など）が協調してタスクを進める構成です。\n\n' +
      'マネージャが全体を統括し、サブタスクを各担当へ割り当て、進捗と統合を管理します。意見が割れる場合は投票で合意を形成します。\n\n' +
      '機械の設計レビューに見立てると、強度・機構・材料・製造性の各視点を別々のエージェントが担当し、相互チェックで抜け漏れを減らす狙いになります。' },
    { name: '09-ClaudeCode-エージェントの構造.md', text:
      'Claude Code に代表されるコーディングエージェントの中核は、while ループ・権限ゲート・ツール・コンテキスト（セッションとメモリ）です。\n\n' +
      'モデルが次の行動を決め、ツールを実行し、結果を文脈に追記して、また次の行動を決める——この繰り返しでタスクを進めます。AI（モデル呼び出し）が占める部分はごく僅かで、大半は権限管理やツール実行などの周辺の仕組み（インフラ）です。\n\n' +
      '危険な操作の前には権限ゲートで承認を求めます。機械の自動化でも、この「人の承認を挟む」という設計思想が、そのまま安全設計に通じます。' },
    { name: '10-Evaluation-評価指標.md', text:
      '検索や回答の品質は、感覚ではなく指標で測ります。ラベル付きデータセットを用意し、Precision@k（取得した上位 k 件のうち正解の割合）と Recall@k（正解のうち取得できた割合）で評価します。\n\n' +
      'Precision が低ければ無関係な断片が混ざっており、Recall が低ければ必要な根拠を取りこぼしています。両者はトレードオフの関係にあります。\n\n' +
      '機械工学のように専門用語が多い領域では、用語辞書や同義語の整備が評価値の改善に効きます。' },
    { name: '11-Playground-プロンプト設計.md', text:
      'プロンプト設計は、モデルから良い出力を引き出す基本技術です。役割・前提・指示・出力形式・制約を明確に書き、曖昧さを減らします。\n\n' +
      '温度（Temperature）は出力のランダム性です。低いと決定的で安定し、高いと多様で創造的になります。仕様書の生成など正確さが要る場面では低めにします。\n\n' +
      'トークン数はコストと文脈長の制約に直結します。送信前にトークン数を見積もり、不要な前置きを削ると安定します。' },
    { name: '12-DocGen-帳票生成.md', text:
      '文書生成（Doc 生成）は、プロンプトから Excel・Word・CSV・Markdown を組み立てる機能です。「列: 部品番号, 諸元, 判定」「20 行」「# 見出し」「- 箇条書き」といった指示を解釈して表や文書を作ります。\n\n' +
      '機械分野では、部品表・諸元表・不具合一覧などの定型帳票の雛形づくりに使えます。解釈は決定論的で、出力ファイルは実体のある本物です。' },
    { name: '13-Research-PDF解析.md', text:
      '技術資料の多くは PDF です。Research では、PDF を端末内で解析し、テキスト抽出・要約（TextRank）・キーワード抽出（TF-IDF）・抽出型 QA・文書内検索ができます。外部送信は行いません。\n\n' +
      '分厚い設計図書や仕様書から要点を素早く把握し、必要な箇所を質問で引き当てる、といった調査に向きます。' },

    /* --- 機械要素（歯車・軸受・軸・ねじ・ばね）ナレッジ --- */
    { name: '20-機械要素の概要.md', text:
      '機械要素は、機械を構成する基本的な部品で、動力や運動の伝達・変換・支持を担います。代表的なものに、ねじ・ボルト、軸、軸受、歯車、ベルト・チェーン、ばね、軸継手、カム、リンク機構があります。\n\n' +
      'これらは規格化されているものが多く、JIS や ISO の規格に基づいて寸法・強度・はめあいが定められています。標準部品を活用すると、設計・調達・保全が効率化します。\n\n' +
      '機械要素を選定するときは、伝達する力やトルク、回転数、寿命、許容空間、コスト、保全性を考慮し、強度計算で安全率を確認します。\n\n' +
      'ポンプ・送風機・減速機・工作機械などの機械装置も、これら機械要素の組み合わせとして成り立っています。' },
    { name: '21-歯車-種類とかみ合い.md', text:
      '歯車は、歯のかみ合いによって確実に動力と回転を伝える機械要素です。すべりがないため、ベルトなどに比べて伝達効率と同期精度が高いのが特徴です。\n\n' +
      '平歯車は軸が平行な最も基本的な歯車で、はすば歯車は歯を斜めに切ることでかみ合いを滑らかにし、騒音と振動を抑えますが、軸方向に推力（スラスト）が生じます。\n\n' +
      'かさ歯車は交差する軸の間で、ウォームギヤは食い違う軸の間で大きな減速比を得るのに使われます。ラックとピニオンは回転を直線運動に変換します。\n\n' +
      '一般的な歯形にはインボリュート曲線が使われ、中心距離が多少ずれても角速度比が一定に保たれる利点があります。歯車の大きさはモジュール（歯の大きさ）と歯数で表します。' },
    { name: '22-歯車の強度設計.md', text:
      '歯車の主な損傷形態は、歯の根元が繰り返し曲げ応力で折れる歯元折損（曲げ疲労）と、歯面が転がり接触の繰り返しで剥離するピッチング（面圧疲労）です。\n\n' +
      '曲げ強さはルイスの式を基礎に、歯元曲げ応力が許容値以下になるようモジュールや歯幅を決めます。面圧強さはヘルツ接触理論に基づき、歯面の接触応力を評価します。\n\n' +
      '強度を高めるには、適切な材料選定（機械構造用鋼など）と熱処理（浸炭焼入れ・高周波焼入れ）で歯面硬さを上げ、表面を硬く内部を粘り強くします。\n\n' +
      '潤滑は、歯面の摩耗・焼付き・ピッチングを防ぐうえで重要で、すべり速度や荷重に応じて潤滑油や粘度を選びます。' },
    { name: '23-軸と軸継手.md', text:
      '軸は、回転して動力（トルク）を伝える機械要素です。曲げとねじりを同時に受けることが多く、許容ねじり応力・許容曲げ応力と安全率から直径を決めます。\n\n' +
      '軸には、段付き部・キー溝・止め輪溝などの断面急変部があり、ここに応力集中が生じます。すみ肉を丸める（フィレット）ことで応力集中を緩和し、疲労強度を確保します。\n\n' +
      '危険速度（軸の固有振動数と回転数が一致して共振する回転速度）を避けるよう、剛性と回転数の関係を確認します。\n\n' +
      '軸継手は二つの軸を接続する要素で、心ずれを許容するたわみ軸継手や、過負荷時に切り離す安全継手などがあります。' },
    { name: '24-軸受-転がりとすべり.md', text:
      '軸受（ベアリング）は、回転する軸を支持し、摩擦を小さく保ちながら荷重を受ける機械要素です。大きく転がり軸受とすべり軸受に分けられます。\n\n' +
      '転がり軸受は、内輪・外輪の間に玉やころ（転動体）を挟み、転がり接触で摩擦を低減します。深溝玉軸受はラジアル荷重に、円すいころ軸受やアンギュラ玉軸受はラジアルとアキシアルの複合荷重に適します。\n\n' +
      'すべり軸受は、軸と軸受の間に油膜を形成して面で支持する方式で、高荷重・高速・低騒音に向きます。流体潤滑では油膜が両者を完全に隔て、金属接触を防ぎます。\n\n' +
      '転がり軸受の寿命は、転動疲労による剥離（フレーキング）で定まり、基本定格寿命（L10）として荷重と回転数から推定します。適切な潤滑とシールが寿命を左右します。' },
    { name: '25-ねじ・ばね・ベルト.md', text:
      'ねじは、らせん状のねじ山によって締結や運動変換を行う機械要素です。締結用には三角ねじ、運動・力の伝達には角ねじや台形ねじが使われます。\n\n' +
      'ボルト締結では、適切な締付けトルクで初期張力（軸力）を与え、ゆるみと疲労を防ぎます。ばね座金やダブルナットなどのゆるみ止めも併用します。\n\n' +
      'ばねは、弾性変形によってエネルギーを蓄え、力を緩衝・保持する要素です。コイルばね・板ばね・皿ばねなどがあり、ばね定数で変形と荷重の関係を表します。\n\n' +
      'ベルトとチェーンは、離れた軸の間で動力を伝える巻き掛け伝動要素です。ベルトは静粛で衝撃吸収に優れ、チェーンはすべりがなく大きな力を確実に伝えます。' },
    { name: '26-材料力学の基礎.md', text:
      '材料力学は、部材に外力が働いたときの応力・ひずみ・変形を扱い、壊れない寸法を決めるための基礎理論です。\n\n' +
      '基本的な荷重には、引張・圧縮・せん断・曲げ・ねじりがあります。応力は単位面積あたりの内力、ひずみは変形の割合で、弾性域では両者がフックの法則で比例します（比例定数が縦弾性係数）。\n\n' +
      'はりの曲げでは、断面に生じる曲げ応力は断面係数に反比例し、たわみは断面二次モーメントと材料の剛性で決まります。中立軸から遠いほど曲げ応力が大きくなります。\n\n' +
      '細長い柱は、圧縮で座屈する恐れがあり、オイラーの式で座屈荷重を見積もります。繰り返し荷重では、静的強度より低い応力でも疲労破壊が起こるため、応力振幅と繰り返し数で評価します。' },
    { name: '27-公差とはめあい.md', text:
      '実際の部品には寸法のばらつきが避けられないため、許容できる寸法の範囲を公差として図面に指示します。\n\n' +
      'はめあいは、穴と軸の組み合わせ方で、すきまばめ（必ずすきまができる）、しまりばめ（必ず締め代ができる）、中間ばめ（すきまか締め代のどちらかになる）に分かれます。\n\n' +
      '軸受や歯車をはめる軸では、用途に応じてはめあいを選びます。回転して荷重方向が変わる輪にはしまりばめ、静止輪にはすきまばめ、というように荷重条件で使い分けます。\n\n' +
      '寸法公差に加え、形状・姿勢・位置・振れを規定する幾何公差（GD&T）を併用すると、機能を満たしつつ過剰品質を避けた設計ができます。' },
    { name: '28-強度評価とトラブル.md', text:
      '機械の信頼性設計では、想定される荷重・環境に対し、強度・剛性・寿命を評価し、安全率を見込んで余裕を持たせます。\n\n' +
      '代表的な破損形態には、過大荷重による延性破壊・脆性破壊、繰り返し荷重による疲労破壊、高温長時間でのクリープ、座屈、摩耗、腐食、応力腐食割れがあります。\n\n' +
      '疲労破壊は、応力集中部（切欠き・溝・きずなど）を起点に進展することが多く、フィレットの付与・表面仕上げの改善・表面硬化処理（ショットピーニングなど）で寿命を延ばせます。\n\n' +
      'いずれも、応力集中の緩和・適切な材料と熱処理・潤滑とシール・点検による予兆把握が基本対策です。過去のトラブル事例は不具合履歴として蓄積し、再発防止に活用します。' },

    /* --- 機械工学（概説・設計・パルプ紙/繊維機械）要約 --- */
    { name: '30-機械工学の基礎.md', text:
      '機械（machine）とは、動力を受け取り、拘束された相対運動を通じて有用な仕事を行う装置の総称です。複数の部品が一定の拘束のもとで動き、入力（動力）を目的の運動・力・仕事へ変換します。\n\n' +
      '機械工学は、機械の設計・製作・運転に関わる工学分野で、材料力学・機構学・熱力学・流体力学・制御工学などを基礎にします。\n\n' +
      '機械を構成する基本部品を機械要素と呼びます。ねじ・ボルト、軸、軸受、歯車、ベルトやチェーン、ばね、軸継手、カム、リンク機構などがあり、動力の伝達・変換・支持を担います。\n\n' +
      '産業機械（ポンプ・送風機・減速機・工作機械）も、これら機械要素と機械工学の原理の上に成り立っています。' },
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

  /* subword merges learned from the ENTIRE knowledge base, so Ask tokenizes with
   * the full-KB vocabulary even though each answer only trains on retrieved
   * chunks. Prefer the Neural Lab base model's merges (already learned on the
   * whole KB); otherwise learn once and cache by KB signature. */
  var _mergeCache = { sig: '', merges: null };
  function kbMerges() {
    var docs = getDocs();
    var sig = docs.map(function (d) { return d.name + ':' + (d.text || '').length; }).join('|');
    if (_mergeCache.sig === sig && _mergeCache.merges) return _mergeCache.merges;
    var base = NSCode.neuralLab && NSCode.neuralLab.state && NSCode.neuralLab.state.model;
    var merges = (base && base.merges && base.merges.length)
      ? base.merges
      : NSCode.neuralLM.learnMerges(docs.map(function (d) { return d.text; }).join('\n'));
    _mergeCache = { sig: sig, merges: merges };
    return merges;
  }

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

  /* drop generic question scaffolding so retrieval/sentence-ranking key off the
   * CONTENT words (歯車・軸受…), not boilerplate (「重要な点」「種類と特徴」「とは」).
   * Without this, a doc dense in 重要/設計/種類 (e.g. 重要度分類) hijacks answers. */
  var Q_GENERIC = /について|に関して|に関する|教えてください|教えて|とは何ですか|とは何か|とは|ですか|でしょうか|の仕組み|の特徴|の種類|の方法|の概要|の定義|仕組み|特徴|種類|方法|概要|定義|重要|な点|ポイント|教え/g;
  function coreQuery(q) { return String(q == null ? '' : q).replace(Q_GENERIC, ''); }

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
   * Ranks the real sentences/list-items of those source documents by lexical +
   * semantic match to the question. If the best match is part of an enumerated
   * list ((1)(2)(3) / ①② / ・ …), the whole list block is returned in document
   * order so the answer keeps its structure; otherwise the best few sentences
   * are returned. Always real text from the docs (the baby LM can't synthesize). */
  function composeAnswer(query, hits, docs, max) {
    var emb = NSCode.embeddings, qv = emb.embed(query, 64), lim = max || 3;
    var hitSources = {};
    hits.forEach(function (h) { hitSources[h.chunk.source] = 1; });
    var LIST = /^\s*(?:[（(]\s*[0-9０-９一二三四五六七八九十]+\s*[)）]|[①-⑳㉑-㉟]|[0-9０-９]+\s*[.\．、)]|[・･\-*])\s*\S/;
    function clean(line) {
      return line.replace(/^[ \t]*#{1,6}[ \t]+/, '').replace(/^[ \t]*>[ \t]?/, '').replace(/[*_`]+/g, '').trim();
    }
    // ordered lines per source (to re-assemble enumerations) + flat rankable units
    var perSource = {}, units = [];
    docs.filter(function (d) { return hitSources[d.name]; }).forEach(function (d) {
      var lines = [];
      String(d.text || '').split('\n').forEach(function (rawLine) {
        var isList = LIST.test(rawLine), line = clean(rawLine), li = lines.length;
        lines.push({ text: line, isList: isList });
        if (!line) return;
        if (isList) {
          if (line.length > 3) units.push({ s: line, src: d.name, li: li, isList: true });
        } else {
          NSCode.research.splitSentences(line).forEach(function (s) {
            s = s.trim(); if (s.length > 6) units.push({ s: s, src: d.name, li: li, isList: false });
          });
        }
      });
      perSource[d.name] = lines;
    });
    var qg = {}; gram(query).forEach(function (x) { qg[x] = 1; });
    function score(s) {
      var gs = gram(s), m = 0; gs.forEach(function (x) { if (qg[x]) m++; });
      var lex = gs.length ? m / Math.sqrt(gs.length) : 0;
      return lex + 0.25 * emb.cosine(qv, emb.embed(s, 64));
    }
    units.forEach(function (u) { u.score = score(u.s); });
    units.sort(function (a, b) { return b.score - a.score; });

    // (A) structured answer: when the most relevant line is (or introduces) an
    // enumerated list, return the whole list block — lead-in line, the items in
    // document order, and a short closing line — so the answer keeps its shape.
    var top = units[0];
    if (top && top.score > 0) {
      var lines = perSource[top.src];
      // find a list line at the top match, or up to 2 prose lines below it
      // (heading → intro → list), so a matching heading still finds its list.
      var listAt = -1, seen = 0;
      for (var c = top.li; c < lines.length && c <= top.li + 6; c++) {
        if (!lines[c].text) continue;
        if (lines[c].isList) { listAt = c; break; }
        if (++seen > 2) break;
      }
      if (listAt >= 0) {
        var i0 = listAt, i1 = listAt;
        while (i0 - 1 >= 0 && lines[i0 - 1].isList) i0--;
        while (i1 + 1 < lines.length && lines[i1 + 1].isList) i1++;
        if (i1 - i0 + 1 >= 2) {                                                // a real enumeration
          var block = [], pp = i0 - 1;
          while (pp >= 0 && !lines[pp].text) pp--;                            // nearest line above = lead-in
          if (pp >= 0 && !lines[pp].isList && lines[pp].text.length <= 90 && score(lines[pp].text) > 0) block.push(lines[pp].text);
          for (var k = i0; k <= i1 && block.length < 12; k++) if (lines[k].text) block.push(lines[k].text);
          var t = i1 + 1; while (t < lines.length && !lines[t].text) t++;     // short closing line ("である" 等)
          if (t < lines.length && !lines[t].isList && lines[t].text.length <= 16) block.push(lines[t].text);
          if (block.length >= 3) return block;
        }
      }
    }

    // (B) prose answer: prefer real sentences, then list/headings, then most similar.
    var hasEnder = function (s) { return /[。．！？!?]/.test(s); };
    var prose = units.filter(function (u) { return !u.isList && hasEnder(u.s); });
    var other = units.filter(function (u) { return u.isList || !hasEnder(u.s); });
    var answer = [];
    function pushUnique(cand) {
      if (!answer.some(function (q2) { return q2.indexOf(cand) >= 0 || cand.indexOf(q2) >= 0; })) answer.push(cand);
    }
    function take(arr, needScore, limN) {
      for (var i = 0; i < arr.length && answer.length < limN; i++) {
        if (needScore && arr[i].score <= 0) break;
        pushUnique(arr[i].s);
      }
    }
    take(prose, true, lim);
    if (!answer.length) take(other, true, lim);
    if (!answer.length) take(prose, false, Math.min(2, lim));
    if (!answer.length) take(other, false, Math.min(2, lim));
    return answer;
  }

  /* ---- shared clean-sentence extraction (used by the concise answer AND the
   * memory summary) ---- */
  var ENDER = /[。．！？!?]/;
  function cleanLine(line) {
    return line.replace(/^[ \t]*#{1,6}[ \t]+/, '').replace(/^[ \t]*>[ \t]?/, '').replace(/[*_`]+/g, '').trim();
  }
  // strip PDF-extraction noise from a sentence: leading bullets/dots, page
  // header/footer tokens (「β9－140 β9編 法 工 学」), inline figure/table/equation
  // refs and enumeration markers, then collapse spaces.
  function sanitizeSent(s) {
    s = String(s || '');
    s = s.replace(/[（(]\s*(?:図|表|式)[^）)]*[）)]/g, '');        // （図2･32）（表3･21）（式…）
    s = s.replace(/式\s*\([^)]*\)/g, '');                          // 式(Ⅰ-4･62)
    s = s.replace(/[（(]\s*[ⅰ-ⅹⅠ-Ⅹ]+\s*[）)]/g, '');             // (ⅰ)(ⅱ) 列挙マーカー
    s = s.replace(/[（(]\s*[0-9０-９]{1,2}\s*[）)]/g, '');          // (1)(2) インライン列挙/段組み混線
    s = s.replace(/β\s*\d+\s*[－-]\s*\d+|β\s*\d+\s*編|[一-鿿]\d+\s*編/g, ''); // ページヘッダ/フッタ
    s = s.replace(/^[\s.．。・･,，、:：;；)\]】」』>＞〕）]+/, '');     // 行頭ドット/記号
    s = s.replace(/[ \t　]{2,}/g, ' ').replace(/\s+([、。，．）)」』])/g, '$1').trim();
    return s;
  }
  // reject headings / captions / enumerations / fragments / garbled math so only
  // real, readable prose sentences survive.
  function isJunkSent(s) {
    if (!ENDER.test(s)) return true;
    if (s.replace(/[\s、，]/g, '').length < 14) return true;
    if (/^[をはがのにへともでやゝ々、，。・ー）)】」』＞]/.test(s)) return true;
    if (/^\s*(?:表|図|式|付表|付図|第\s*[0-9０-９]+\s*[章節項表図])/.test(s)) return true;
    if (/^\s*(?:[（(]?\s*[0-9０-９a-zａ-ｚ]+\s*[)）.\．、]|[①-⑳]|[・･\-*▪◦])/.test(s)) return true;
    if ((s.match(/：/g) || []).length >= 2) return true;
    if (/[＝∫∑Σ∏Γ∇√]/.test(s)) return true;
    if (/[（(]\s*[0-9０-９]{1,2}\s*[）)]\s*\S/.test(s)) return true;
    if (/[βα]\s*\d|－\s*\d{2,}|\d+\s*編\b/.test(s)) return true;
    // two-column PDF merge: Japanese text gets stray spaces after 、，or between
    // CJK chars (e.g.「， は荷重， は試験前」). ≥2 such gaps ⇒ interleaved garbage.
    if ((s.match(/[、，][ 　\t]/g) || []).length >= 2) return true;
    if ((s.match(/[一-鿿ぁ-ヿ][ 　\t][一-鿿ぁ-ヿ]/g) || []).length >= 2) return true;
    var letters = (s.match(/[一-鿿ぁ-ヶ゠-ヿ]/g) || []).length;
    if (letters < s.length * 0.55) return true;
    return false;
  }
  function isHeadingLine(line) {
    if (ENDER.test(line)) return false;
    if (line.length <= 9) return true;
    if (/^\s*(?:表|図|式|付表|付図|第\s*[0-9０-９]+\s*[章節項表図])/.test(line)) return true;
    if (/^[0-9０-９]+[\.\．・]/.test(line)) return true;
    return false;
  }
  // Rebuild whole sentences from a document. KB docs (PDF-extracted) hard-wrap
  // lines MID-SENTENCE, so we accumulate lines into a buffer and only emit when a
  // sentence ender appears (re-joining soft wraps); blank/heading lines reset it.
  function buildSentences(text) {
    var out = [], buf = '';
    String(text || '').split('\n').forEach(function (raw) {
      var line = cleanLine(raw);
      if (!line || isHeadingLine(line)) { buf = ''; return; }
      buf += line;
      var lastEnder = -1;
      for (var i = 0; i < buf.length; i++) if ('。．！？!?'.indexOf(buf.charAt(i)) >= 0) lastEnder = i;
      if (lastEnder >= 0) {
        NSCode.research.splitSentences(buf.slice(0, lastEnder + 1)).forEach(function (s) { s = sanitizeSent(s); if (s) out.push(s); });
        buf = buf.slice(lastEnder + 1);
      } else if (buf.length > 180) { buf = ''; }
    });
    return out;
  }
  // ordered whole sentences from the FULL source documents behind the hits
  function hitDocGroups(hits, docs) {
    var hitSources = {}; (hits || []).forEach(function (h) { hitSources[h.chunk.source] = 1; });
    var groups = [];
    (docs || []).filter(function (d) { return hitSources[d.name]; }).forEach(function (d) {
      groups.push({ src: d.name, arr: buildSentences(d.text) });
    });
    return groups;
  }
  /* MEMORY summary: the retrieved context is the working memory for this question.
   * We keep only the CLEAN sentences most relevant to the question (so off-topic
   * docs among the top hits don't leak in), then compress them into a short
   * extractive summary via the memory engine. Clean+relevant in → readable out. */
  function contextMemo(question, hits, docs, n) {
    if (!NSCode.memory) return '';
    var emb = NSCode.embeddings, qv = emb.embed(question, 64);
    var qg = {}; gram(coreQuery(question)).forEach(function (x) { qg[x] = 1; });
    var seen = {}, cands = [];
    hitDocGroups(hits, docs).forEach(function (g) {
      g.arr.forEach(function (s) {
        if (seen[s] || isJunkSent(s) || s.length < 18 || s.length > 160) return;
        seen[s] = 1;
        var gs = gram(s), m = 0; gs.forEach(function (x) { if (qg[x]) m++; });
        var rel = (gs.length ? m / Math.sqrt(gs.length) : 0) + 0.25 * emb.cosine(qv, emb.embed(s, 64));
        cands.push({ s: s, rel: rel });
      });
    });
    if (!cands.length) return '';
    cands.sort(function (a, b) { return b.rel - a.rel; });
    var turns = cands.slice(0, 8).map(function (c) { return { text: c.s }; });   // relevant subset only
    return (NSCode.memory.compress(turns, n || 3).summary || '').trim();
  }

  /* CONCISE grounded answer (~target chars) — the baby model's natural reply.
   * From the retrieved passages we take real sentences as candidates, rank them
   * by question relevance (lexical + semantic), then RE-RANK the shortlist by the
   * trained net's own confidence (mean log-prob / seqLogProb). The text is always
   * real corpus text → grammatically clean; the net does the selection → it is
   * the baby model's answer, just kept natural and short. Returns {text, source}. */
  function composeConcise(question, hits, docs, model, target) {
    target = target || 100;
    var emb = NSCode.embeddings, qv = emb.embed(question, 64);
    var qg = {}; gram(coreQuery(question)).forEach(function (x) { qg[x] = 1; });   // content words only
    var groups = hitDocGroups(hits, docs);
    var seen = {}, cands = [];
    groups.forEach(function (g) {
      g.arr.forEach(function (s, idx) {
        if (s.length < 18 || s.length > 140 || seen[s] || isJunkSent(s)) return;
        seen[s] = 1; cands.push({ s: s, g: g, idx: idx });
      });
    });
    if (!cands.length) return { text: '', source: '' };
    // (1) relevance (same shape as composeAnswer): lexical overlap + cosine
    function rel(s) {
      var gs = gram(s), m = 0; gs.forEach(function (x) { if (qg[x]) m++; });
      var lex = gs.length ? m / Math.sqrt(gs.length) : 0;
      return lex + 0.25 * emb.cosine(qv, emb.embed(s, 64));
    }
    cands.forEach(function (c) { c.rel = rel(c.s); });
    cands.sort(function (a, b) { return b.rel - a.rel; });
    var shortlist = cands.slice(0, 16);   // bound the neural scoring cost
    // (2) neural confidence on the shortlist (how well the net recalls each line),
    // normalized 0..1 and blended with relevance — the net picks the cleanest line.
    var nl = (model && NSCode.neuralLM) ? NSCode.neuralLM : null;
    shortlist.forEach(function (c) { c.nc = nl ? nl.seqLogProb(model, nl.encode(model, c.s)) : 0; });
    var ncs = shortlist.map(function (c) { return c.nc; });
    var mn = Math.min.apply(null, ncs), mx = Math.max.apply(null, ncs);
    shortlist.forEach(function (c) {
      c.ncn = (mx > mn) ? (c.nc - mn) / (mx - mn) : 0.5;
      c.final = c.rel + 0.4 * c.ncn - 0.0015 * Math.max(0, c.s.length - 120);  // gently prefer ≤~120字 (P4)
    });
    shortlist.sort(function (a, b) { return b.final - a.final; });
    var top = shortlist[0], picked = [top.s], used = {}, len = top.s.length;
    used[top.s] = 1;
    function tryAdd(s) {
      if (!s || used[s] || isJunkSent(s)) return;
      if (len + s.length > target + 20) return;                          // cap ~120字 (P4)
      picked.push(s); used[s] = 1; len += s.length;
    }
    // grow toward ~target only when the lead sentence is short; keep whole
    // sentences (never cut mid-clause) so the result stays grammatical.
    // (a) continue with the FOLLOWING sentences of the same passage (most coherent)
    var arr = top.g.arr;
    for (var i = top.idx + 1; i < arr.length && len < target - 25; i++) tryAdd(arr[i]);
    // (b) still short → add the next best relevant clean sentences (same topic)
    for (var k = 1; k < shortlist.length && len < target - 25; k++) tryAdd(shortlist[k].s);
    var out = picked.join('');
    // safety net only: an extreme single sentence → trim at the last ender in range
    if (out.length > target + 60) {
      var head = out.slice(0, target + 60), pos = -1;
      ['。', '．', '！', '？', '!', '?'].forEach(function (e) { var p = head.lastIndexOf(e); if (p > pos) pos = p; });
      if (pos >= 40) out = head.slice(0, pos + 1);
    }
    return { text: out.trim(), source: top.g.src, rel: top.rel };
  }

  /* P1 relevance floor — a confident off-topic answer is worse than admitting no
   * match (e.g. unrelated queries used to surface the OHSMS catch-all doc). Accept
   * only if retrieval was reasonably strong OR the answer shares a content term
   * with the question (generic template/stop words removed first). */
  function weakRelevance(question, answer, topCos) {
    if (!answer) return true;
    var qg = {}; gram(coreQuery(question)).forEach(function (x) { qg[x] = 1; });
    var m = 0; gram(answer).forEach(function (x) { if (qg[x]) m++; });
    if (m >= 1) return false;            // answer shares a content term with the question → trust it
    return topCos < 0.33;                // no shared term: trust only when retrieval is strong (avoids the 仕組み/特徴 catch-all)
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
    // tokenize with subwords learned from the WHOLE KB (not just the retrieved
    // slice) so word boundaries are stable even on a small context — reuse the
    // Neural Lab base model's merges if trained, else learn once and cache.
    var m = L.create(context, { context: 4, dim: 20, hidden: 48, maxVocab: 400, merges: kbMerges() });
    // extractive answer from the retrieved passages — the reliable, grammatical
    // reply shown as the main answer (the neural generation is a learning demo).
    var compose = composeAnswer(question, res.hits, getDocs());
    return L.trainAsync(m, { steps: opts.steps || 5000, chunk: 1250, lr: 0.18, onProgress: opts.onProgress })
      .then(function () {
        // baby model's answer: one concise, grounded ~100-char sentence selected
        // from the retrieved passages and re-ranked by the trained net (natural).
        var concise = composeConcise(question, res.hits, getDocs(), m, opts.target || 100);
        var weak = weakRelevance(question, concise.text, res.hits[0] ? res.hits[0].score : 0);
        if (weak) concise = { text: '', source: '' };
        var memo = weak ? '' : contextMemo(question, res.hits, getDocs(), 3);
        // publish this run so every Lab can visualize the same query (Ask ↔ sidebar)
        if (NSCode.lastRun) NSCode.lastRun.set({
          query: question,
          qvec: Array.prototype.slice.call(NSCode.embeddings.embed(question, 64)).slice(0, 16),
          hits: res.hits.map(function (h) { return { source: h.chunk.source, score: h.score, text: h.chunk.text }; }),
          answer: weak ? [] : compose, generated: concise.text, source: concise.source, seed: concise.source, memo: memo, ts: Date.now()
        });
        return { text: concise.text, source: concise.source, weak: weak, memo: memo, compose: weak ? [] : compose, hits: res.hits, loss: m.loss };
      });
  }

  /* ---------- Prebuilt knowledge base (機械工学, 5809 docs) ----------
   * A pruned TF-IDF inverted index (assets/kb/index.json) is loaded once; the
   * query picks the top docs, only those .md are fetched, then the SAME hybrid
   * (search → neural learns retrieved chunks → generate) runs on them. This
   * scales to thousands of docs without loading everything. */
  var KB_INDEX_URL = 'assets/kb/index.json', KB_DOC_URL = 'assets/kb/docs/';
  var kbPromise = null, kbDocCache = {};

  function loadKB() {
    if (kbPromise) return kbPromise;
    kbPromise = fetch(KB_INDEX_URL).then(function (r) { if (!r.ok) throw new Error('index ' + r.status); return r.json(); });
    return kbPromise;
  }
  function searchKB(index, query, k) {
    var qt = gram(query), seen = {}, score = {};   // gram() == the index builder's term extraction
    qt.forEach(function (t) {
      if (seen[t]) return; seen[t] = 1;
      var p = index.post[t]; if (!p) return;
      p.forEach(function (e) { score[e[0]] = (score[e[0]] || 0) + e[1]; });
    });
    return Object.keys(score).map(function (i) { return { idx: +i, score: score[i], title: index.meta[+i] }; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, k);
  }
  function fetchKBDoc(idx) {
    if (kbDocCache[idx]) return Promise.resolve(kbDocCache[idx]);
    var pad = ('0000' + (idx + 1)).slice(-4);
    return fetch(KB_DOC_URL + pad + '.md').then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { kbDocCache[idx] = t; return t; });
  }

  /* hybrid answer over the prebuilt KB -> Promise<{text,compose,seed,seeds,hits}>.
   * Mirrors hybridAnswer (compose + neural generation + publish lastRun) so every
   * Lab can visualize the same KB query. */
  function hybridAnswerKB(question, opts) {
    opts = opts || {};
    if (!question) return Promise.resolve(null);
    return loadKB().then(function (index) {
      var top = searchKB(index, question, opts.topDocs || 10);
      if (!top.length) return { text: '', seed: '', hits: [] };
      return Promise.all(top.map(function (t) { return fetchKBDoc(t.idx); })).then(function (texts) {
        var docs = top.map(function (t, i) { return { name: t.title, text: texts[i] }; });
        var chunks = buildChunks(docs);
        var res = NSCode.rag.retrieve(question, chunks, { topK: opts.topK || 4, threshold: 0 });
        if (!res.hits.length) return { text: '', seed: '', hits: [] };
        var context = res.hits.map(function (h) { return h.chunk.text; }).join('\n');
        var L = NSCode.neuralLM;
        var m = L.create(context, { context: 4, dim: 20, hidden: 48, maxVocab: 400 });
        var compose = composeAnswer(question, res.hits, docs);
        return L.trainAsync(m, { steps: opts.steps || 5000, chunk: 1250, lr: 0.18, onProgress: opts.onProgress })
          .then(function () {
            var concise = composeConcise(question, res.hits, docs, m, opts.target || 100);
            var weak = weakRelevance(question, concise.text, res.hits[0] ? res.hits[0].score : 0);
            if (weak) concise = { text: '', source: '' };
            var memo = weak ? '' : contextMemo(question, res.hits, docs, 3);
            if (NSCode.lastRun) NSCode.lastRun.set({
              query: question,
              qvec: Array.prototype.slice.call(NSCode.embeddings.embed(question, 64)).slice(0, 16),
              hits: res.hits.map(function (h) { return { source: h.chunk.source, score: h.score, text: h.chunk.text }; }),
              answer: weak ? [] : compose, generated: concise.text, source: concise.source, seed: concise.source, memo: memo, ts: Date.now()
            });
            return { text: concise.text, source: concise.source, weak: weak, memo: memo, compose: weak ? [] : compose, hits: res.hits, loss: m.loss };
          });
      });
    });
  }

  NSCode.askEngine = {
    DEFAULT_DOCS: DEFAULT_DOCS,
    getDocs: getDocs, setDocs: setDocs, resetDocs: resetDocs, cleanText: cleanText,
    buildChunks: buildChunks, ask: ask, hybridAnswer: hybridAnswer,
    loadKB: loadKB, searchKB: searchKB, hybridAnswerKB: hybridAnswerKB
  };
})(window.NSCode);
