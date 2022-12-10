import esbuild from "esbuild";
import React from "react";
import { AdditionalComponentsExportBase } from "../types/additionalComponents";
import { serve, createSessionHandler } from "./server";
import { hostClientBundles } from "./http";
import { Server as HTTPServer } from "http";
import { createViewProxy } from "./view";
import { Base } from "../views/ui/Base";

export type OmitClassNames<T extends AdditionalComponentsExportBase> = {
  [K in keyof T]: T[K] extends React.FunctionComponent<infer P>
    ? React.FunctionComponent<Omit<P, "className">>
    : never;
};

export async function buildAdditionalComponents(path: string) {
  const outPut = await esbuild.build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  if (outPut.errors.length) {
    throw new Error(outPut.errors[0].text);
  }
  const code = outPut.outputFiles?.[0].text;
  return code;
}

function createCompilerBase<TBase extends AdditionalComponentsExportBase>(
  bundles: Promise<string>[] = [],
  ssrViewsBase: TBase = {} as TBase
) {
  return {
    withComponents<T extends AdditionalComponentsExportBase>(
      entryPoint: string,
      ssrViews: T
    ) {
      bundles.push(buildAdditionalComponents(entryPoint));
      return createCompilerBase<TBase & OmitClassNames<T>>(bundles, {
        ...ssrViewsBase,
        ...Object.entries(ssrViews).reduce(
          (acc, [key, value]) => ({
            ...acc,
            [key]: Base(value),
          }),
          {} as TBase & OmitClassNames<T>
        ),
      });
    },
    compile() {
      return createViewProxy<
        {
          serve: typeof serve;
          createSessionHandler: typeof createSessionHandler;
          hostStatics: (
            server: HTTPServer,
            mountPath?: string
          ) => Promise<ReturnType<typeof hostClientBundles>>
        },
        TBase
      >({
        serve: async (render, options) => {
          const additionalComponents = await Promise.all(bundles);
          return serve(render, {
            ...options,
            additionalComponents: {
              ssrViews: {
                ...ssrViewsBase,
                ...(options?.additionalComponents?.ssrViews ?? {}),
              },
              bundles: [
                ...additionalComponents,
                ...(options?.additionalComponents?.bundles ?? []),
              ],
            },
          });
        },
        createSessionHandler: <T>(options) => {
          return {
            handle: (render, configuration) => {
              return async (req, res) => {
                const additionalComponents = await Promise.all(bundles);
                return createSessionHandler({
                  ...options,
                  additionalComponents: {
                    ssrViews: {
                      ...ssrViewsBase,
                      ...(options?.additionalComponents?.ssrViews ?? {}),
                    },
                    bundles: [
                      ...additionalComponents,
                      ...(options?.additionalComponents?.bundles ?? []),
                    ],
                  },
                }).handle(render as any, configuration)(req, res) as Promise<T>;
              };
            },
          };
        },
        hostStatics(server, mountPath) {
          return Promise.all(bundles).then((bundles) =>
            hostClientBundles(server, mountPath, bundles)
          );
        },
      });
    },
  };
}

export function createCompiler() {
  return createCompilerBase();
}
