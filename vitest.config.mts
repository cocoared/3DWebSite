import { defineConfig } from "vitest/config";

// Vitest（テストランナー）の設定。拡張子を .mts にしているのは、package.json に "type": "module" が無くても ESM として読ませるため
export default defineConfig({
  // モジュールの解決方法の設定
  resolve: {
    // tsconfig.json の paths（"@/*" → "./*"）をテストでも使えるようにする（Vite 8 の標準機能）
    tsconfigPaths: true,
  },
  // テストの設定
  test: {
    // テストを動かす環境。three.js の計算やデータ定義のテストは DOM が要らないので、軽い node にする
    environment: "node",
    // テストファイルとみなすパターン。テスト対象と同じフォルダに xxx.test.ts として置く
    include: ["**/*.test.{ts,tsx}"],
    // テスト対象から外すフォルダ（依存パッケージとビルド成果物）
    exclude: ["node_modules/**", ".next/**"],
    // カバレッジ（テストで実行されたコードの割合）の設定
    coverage: {
      // Node.js 組み込みの計測機能（V8）を使う。追加の変換が要らず速い
      provider: "v8",
      // 計測の対象。UI の見た目ではなく、ロジックを集めた lib/ を測る
      include: ["lib/**/*.ts"],
      // 結果の出力形式。text はターミナルに表、html は coverage/ に詳細ページを出す
      reporter: ["text", "html"],
    },
  },
});
