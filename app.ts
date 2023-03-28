import express from "express";
import sharp from "sharp";
import { z } from "zod";
import fetch from "node-fetch";

const app = express();
const port = process.env.PORT || 3001;

const QueryParams = z.object({
  url: z.string().url(),
  quality: z.coerce.number().min(1).max(100).optional(),
  outputType: z.enum(["webp", "png", "jpeg"]),
  width: z.coerce.number().min(1).optional(),
  height: z.coerce.number().min(1).optional(),
  maxFileSize: z.coerce.number().min(1000).optional(),
});

async function reduceImageQuality(
  inputBuffer: ArrayBuffer,
  maxSize: number,
  outputType: z.infer<typeof QueryParams>["outputType"]
): Promise<Buffer> {
  let quality = 100;
  let step = 5;
  let outputBuffer: Buffer;
  let currentSize: number;

  do {
    outputBuffer = await sharp(inputBuffer)
      [outputType]({ quality: quality })
      .toBuffer();

    currentSize = outputBuffer.length;
    quality -= step;
  } while (currentSize > maxSize && quality > 0);

  if (quality <= 0) {
    throw new Error(
      "Unable to reduce the image size to the specified max file size."
    );
  }

  return outputBuffer;
}

app.get("/", async (req, res) => {
  const parsedQuery = QueryParams.safeParse(req.query);

  if (!parsedQuery.success) {
    res.status(400).send(parsedQuery.error.toString());
    return;
  }
  const queryParams = parsedQuery.data;

  const imageBuffer = await fetch(queryParams.url).then((res) =>
    res.arrayBuffer()
  );
  const image = sharp(imageBuffer);

  if (queryParams.quality) {
    image[queryParams.outputType]({ quality: queryParams.quality });
  }

  if (queryParams.width) {
    image.resize(queryParams.width, queryParams.height);
  }

  try {
    const constrainedImage = queryParams.maxFileSize
      ? await reduceImageQuality(
          imageBuffer,
          queryParams.maxFileSize,
          queryParams.outputType
        )
      : await image.toBuffer();

    res.contentType(`image/${queryParams.outputType}`);
    res.send(constrainedImage);
  } catch (error) {
    res.status(500).send(error?.message || "Unknown error");
  }
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
