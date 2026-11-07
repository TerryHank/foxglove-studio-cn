// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as Comlink from "comlink";

import type { RawImage } from "@foxglove/schemas";

import { decodeRawImage, RawImageOptions } from "./decodeImage";
import type { Image as RosImage } from "../../ros";

function decode(image: RosImage | RawImage, options: Partial<RawImageOptions>): ImageData {
  const result = new ImageData(image.width, image.height);
  decodeRawImage(image, options, result.data);
  return Comlink.transfer(result, [result.data.buffer]);
}

async function decodeBitmap(blob: Blob, resizeWidth?: number): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(blob, { resizeWidth });
  return Comlink.transfer(bitmap, [bitmap]);
}

export const service = {
  decode,
  decodeBitmap,
};
Comlink.expose(service);
