# 競馬予想AIアプリ

3連複で回収率100%超えを目指す、中央競馬専用の予想ツール。

## 目標

- **券種**: 3連複
- **指標**: 回収率(ROI) ≥ 100%
- **対象**: JRA中央競馬、2勝クラス / 3勝クラス / オープン(OP・重賞)
  - 除外クラス: 新馬戦・未勝利戦・1勝クラス・障害
  - (※特徴量生成用に除外クラスのデータも収集だけはする)
- **最終形**: Streamlit による Webアプリ(スマホ/PC両対応)

## ディレクトリ構成

```
競馬AIapp/
├── PROJECT_CONTEXT.md      プロジェクト決定事項まとめ
├── README.md               このファイル
├── requirements.txt
├── .env.example            環境変数テンプレ(コピーして .env を作る)
├── .gitignore
├── data/                   DB・スクレイピングキャッシュ
├── notebooks/              分析・検証用Jupyter
├── src/
│   ├── config.py           設定読込
│   ├── cli.py              CLI エントリポイント
│   ├── db/
│   │   ├── schema.sql      SQLite スキーマ
│   │   └── connection.py   DB ヘルパ
│   └── scraper/
│       ├── client.py       レート制限付き HTTP クライアント
│       ├── race_list.py    日別レース一覧スクレイパー
│       ├── race.py         レース詳細スクレイパー
│       └── parser_utils.py パース共通ユーティリティ
└── tests/
    └── test_parser_utils.py
```

## セットアップ手順

### 1. Python 環境の準備

Python 3.10 以上を推奨。

```bash
# 仮想環境の作成
python -m venv venv

# アクティベート (Windows PowerShell)
venv\Scripts\Activate.ps1

# アクティベート (Git Bash / WSL)
source venv/Scripts/activate
```

### 2. 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 3. 環境変数の設定

`.env.example` を `.env` にコピーし、netkeiba のログイン情報を記入。

```bash
cp .env.example .env
# その後 .env を編集
```

必須項目:
- `NETKEIBA_EMAIL` — netkeiba ログインメール
- `NETKEIBA_PASSWORD` — netkeiba パスワード

### 4. DB の初期化

```bash
python -m src.cli init-db
```
→ `data/keiba.db` が作成される

### 5. ログイン確認

```bash
python -m src.cli login-test
```

「成功」と出ればOK。失敗時は `.env` の認証情報を確認。

## Phase 1 の使い方

### 単一レースを試しに取得(動作確認)

```bash
# 例: 2024年 日本ダービー (race_id=202405021211)
python -m src.cli scrape-one 202405021211
```

### 指定日の全レースを取得

```bash
python -m src.cli scrape-date 2024-05-26
```

### 期間指定で一括取得(5年分)

```bash
python -m src.cli scrape-range 2020-01-01 2024-12-31
```

**注意**: netkeibaは過剰アクセスで弾かれる。デフォルトで3〜5秒のランダムsleepが入るため、
5年分で2〜3日かかる想定。PCをつけっぱなしにして実行すること。
エラー時は中断しても、次回起動時にスクレイピング済みのレースはスキップされる(再開可能)。

### DB 内容の確認

```bash
python -m src.cli stats
```

## データ構造(主要テーブル)

| テーブル | 用途 |
|---|---|
| `races` | レース基本情報(日付・会場・距離・馬場状態等) |
| `race_results` | 1レース×1馬の結果行(着順・タイム・オッズ・人気・上がり3F 等) |
| `horses` | 馬マスター(名前・性・生年月日・父母等) |
| `jockeys` | 騎手マスター |
| `trainers` | 調教師マスター |
| `payouts` | 払戻情報(単勝〜三連単) |
| `scrape_log` | スクレイピング進捗ログ(再開制御用) |

## テスト実行

```bash
pip install pytest
pytest tests/
```

## 今後のフェーズ

- **Phase 2**: 特徴量エンジニアリング(過去成績・騎手・血統・馬場・ペース等)
- **Phase 3**: 予測モデル(LightGBM で top3 確率を推定)
- **Phase 4**: 期待値ベット戦略(EV計算 + 買い目生成ロジック)
- **Phase 5**: バックテスト(walk-forward で回収率検証)
- **Phase 6**: Streamlit アプリ化(スマホ/PC両対応)

## netkeiba スクレイピングのマナー

- リクエスト間隔: 最低2秒、推奨3〜5秒(`.env` で調整可)
- 429/503 時は指数バックオフで自動リトライ
- 差分取得: 一度成功したレースは `scrape_log` に記録され再取得されない
- ログインセッションは `data/netkeiba_session.json` に永続化(秘匿情報、gitignore済)
