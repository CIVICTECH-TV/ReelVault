# ReelVault（リールボルト）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ReelVault は、映像制作者が制作済みの映像プロジェクト・素材・納品ファイルを、AWS S3 Deep Archive を活用して安全かつ簡単に長期保管・復元できるデスクトップアプリケーションです。

---

## ✨ 主な特徴

- **あなたのAWSアカウントで安全に**: データはあなた自身のAWSアカウントに保存されるため、管理責任が明確です。
- **簡単・自動で長期保管**: ファイルを置いておくだけで、コストの安いAWS S3 Deep Archiveに自動で送られます。
- **直感的なデスクトップアプリ**: 難しいコマンドは不要。使い慣れたデスクトップアプリで、誰でも簡単に操作できます。
- **macOSに最適化**: macOSのKeychainと統合し、認証情報を安全に管理します。

## 📥 インストール

> 現在はmacOS版のみ提供しています。

最新のリリースは [こちらのリリース・ページ](https://github.com/CIVICTECH-TV/ReelVault/releases) からダウンロードしてください。

`.dmg`ファイルをダウンロードし、アプリケーションフォルダにドラッグ＆ドロップするだけでインストールは完了です。

## 📖 使い方

詳しい使い方は、[ユーザーマニュアル](docs/user/MANUAL.md)をご覧ください。（現在準備中です）

## 🛠️ 主な技術スタック

- **アプリケーションフレームワーク**: [Tauri](https://tauri.app/) (Rust + React)
- **クラウドストレージ**: AWS S3 (Deep Archive)
- **対応OS**: macOS

## 🤝 コントリビューション

このプロジェクトはオープンソースです。開発に参加したい方は、[開発者ガイド](DEVELOPER_GUIDE.md)をご覧ください。
バグ報告や機能要望は[Issues](https://github.com/CIVICTECH-TV/ReelVault/issues)にお願いします。

## 📄 ライセンス

このプロジェクトは [MIT License](LICENSE) のもとで公開されています。 