//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  {
    ignores: [
      ".nitro/**",
      ".output/**",
      ".tanstack/**",
      ".vinxi/**",
      "dist/**",
      "dist-ssr/**",
    ],
  },
  ...tanstackConfig,
]
