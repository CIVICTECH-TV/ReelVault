# ReelVault 開発者ガイド

このドキュメントは、ReelVaultプロジェクトの開発者向けの情報を提供します。
プロジェクトへのコントリビュートを検討している方は、まずこちらをお読みください。

## 🚀 開発環境のセットアップ

### 1. 前提条件のインストール

macOS環境での開発を前提としています。

- **Node.js**: v18以上を推奨します。[公式サイト](https://nodejs.org/)からインストールしてください。
- **Rust**: 公式の`rustup`インストーラを使用します。
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Tauri CLI**: Rustのパッケージマネージャーである`cargo`を使ってインストールします。
  ```bash
  cargo install tauri-cli
  ```

### 2. プロジェクトのクローンとセットアップ

```bash
# プロジェクトをクローン
git clone https://github.com/CIVICTECH-TV/ReelVault.git
cd ReelVault

# フロントエンドの依存関係をインストール
npm install

# Rustの依存関係をビルド（初回は時間がかかります）
cd src-tauri
cargo build
cd ..
```

### 3. 開発サーバーの起動

以下のコマンドで、開発モードのアプリケーションが起動します。フロントエンドやバックエンドのソースコードを変更すると、自動的に再ビルドされます。

```bash
cargo tauri dev
```

## 🏗️ アーキテクチャとプロジェクト構造

ReelVaultは、**Tauri**フレームワークをベースにしています。
- **バックエンド**: Rustで実装され、ファイル操作、AWSとの通信、暗号化などの重い処理を担当します。
- **フロントエンド**: React (TypeScript) で実装され、ユーザーインターフェースを提供します。

バックエンドとフロントエンドは、TauriのCommand機能を通じて非同期に通信します。

### プロジェクト構造

プロジェクトの主要なディレクトリとファイルは以下の通りです。

```
ReelVault/
├── src/                     # React フロントエンド
│   ├── components/          # Reactコンポーネント
│   └── ...
├── src-tauri/               # Tauri バックエンド (Rust)
│   ├── src/
│   │   ├── commands/        # Tauriコマンド（API実装）
│   │   └── main.rs
│   └── Cargo.toml           # Rust依存関係 (バージョン定義の原本)
├── infrastructure/          # AWS CloudFormation テンプレート
│   └── ...
├── docs/                    # ドキュメント
│   ├── api/                 # API仕様書
│   └── user/                # ユーザーマニュアル
└── DEVELOPER_GUIDE.md       # 開発者ガイド (このファイル)
```

## 🧪 テスト

品質を保つため、いくつかのテストを用意しています。

```bash
# フロントエンドのユニットテスト (Jest)
npm test

# Rustのユニットテスト
cd src-tauri
cargo test
cd ..

# E2Eテスト (Playwright)
npm run test:e2e
```

## 📦 バージョン管理とリリースフロー

### バージョン管理方針 (`v0`段階)

`v1.0.0`として最初の安定版をリリースするまでは、バージョンを **`v0.MINOR.PATCH`** の形式で管理します。

- **`PATCH` (`v0.1.0` → `v0.1.1`)**:
  - **対象**: バグ修正、ドキュメント更新など、後方互換性を壊さない**小さな修正**。ユーザーから見て機能的な変化はありません。

- **`MINOR` (`v0.1.0` → `v0.2.0`)**:
  - **対象**: 新機能の追加、既存機能の変更、APIの変更、依存関係の更新など、**何かしら新しいことが起こった**場合。
  - `v0`段階では、互換性を壊す変更も`MINOR`を上げます。

- **`v1.0.0`**:
  - **対象**: 主要機能が一通り安定して動作する**最初の安定版（MVP）**が完成したと判断した時。

### リリース手順

1.  **`main`ブランチを最新化**:
    - リリース対象の機能がすべて`main`にマージされていることを確認します。

2.  **バージョン更新**:
    - `src-tauri/Cargo.toml` の `version` を、上記の方針に従って更新します。ここがバージョン情報の**唯一の真実**です。

3.  **コミット**:
    - バージョン更新をコミットします (`git commit -m "chore: Bump version to vX.Y.Z"`)。

4.  **アプリケーションのビルド**:
    - `cargo tauri build` を実行し、配布用の成果物 (`.dmg`など) を作成します。
    - ビルドされたアプリケーションは `src-tauri/target/release/bundle/` の下に作成されます。

5.  **GitHubリリース作成**:
    - `gh release create` を使い、**`Cargo.toml`と全く同じバージョン番号**でタグとリリースを作成します。
    - `--generate-notes` を使えば、リリースノートを自動生成できます。

    ```bash
    # 例: v0.2.0 のリリース
    gh release create v0.2.0 \\
        --generate-notes \\
        --title "ReelVault v0.2.0" \\
        src-tauri/target/release/bundle/macos/ReelVault.dmg
    ```


## 🤝 コントリビューション

ReelVault はオープンソースプロジェクトです。バグ報告、機能要望、プルリクエストを歓迎しています。

### 開発フロー

1.  このリポジトリをフォークします。
2.  作業内容に応じたフィーチャーブランチを作成します (`git checkout -b feature/amazing-feature`)。
3.  変更をコミットします (`git commit -m 'Add amazing feature'`)。
4.  作成したブランチにプッシュします (`git push origin feature/amazing-feature`)。
5.  プルリクエストを作成し、変更内容を説明してください。

### コードスタイル

- **TypeScript**: ESLint + Prettier に従います。コミット前に`npm run lint`と`npm run format`を実行してください。
- **Rust**: `rustfmt` と `clippy` に従います。`cargo fmt` と `cargo clippy` を実行してください。 