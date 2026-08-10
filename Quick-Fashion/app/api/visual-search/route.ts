import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  productToFeatureVector,
  imageAnalysisToFeatureVector,
  weightedCosineSimilarity,
  cosineSimilarity,
  FEATURE_COUNT,
  normalizeVisualGarmentCategory,
  vectorGarmentCategory,
  vectorMatchesGarmentCategory,
  productVisualCategorySpecificity,
  type VisualGarmentCategory,
} from '@/lib/visual-search/features';
import { analyseImage } from '@/lib/visual-search/image-analysis';
import { toErrorResponse } from '@/lib/utils/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { features, image, mimeType, category } = body as {
      features?: number[];
      image?: string;
      mimeType?: string;
      category?: string;
    };

    let queryVector: number[];
    let analysisDetails: {
      geminiLabels?: Record<string, string> | null;
      brightness?: number;
      colourVariance?: number;
    } | null = null;
    let useWeightedSimilarity = false;
    let detectedCategory: VisualGarmentCategory | null =
      normalizeVisualGarmentCategory(category);

    if (image) {
      const analysis = await analyseImage(image, mimeType || 'image/jpeg');
      queryVector = imageAnalysisToFeatureVector(analysis, category || undefined);
      useWeightedSimilarity = true;
      analysisDetails = {
        geminiLabels: analysis.geminiLabels,
        brightness: analysis.brightness,
        colourVariance: analysis.colourVariance,
      };
      detectedCategory ??=
        normalizeVisualGarmentCategory(analysis.geminiLabels?.category) ??
        normalizeVisualGarmentCategory(analysis.inferredCategoryFallback);
    } else if (
      Array.isArray(features) &&
      features.length === FEATURE_COUNT &&
      features.every((v: unknown) => typeof v === 'number' && (v === 0 || v === 1))
    ) {
      queryVector = features;
      detectedCategory ??= vectorGarmentCategory(queryVector);
    } else {
      return NextResponse.json(
        { error: `Provide either 'image' (base64 data URL) or 'features' (binary array of length ${FEATURE_COUNT})` },
        { status: 400 },
      );
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        stockQuantity: { gt: 0 },
      },
      include: {
        auction: true,
        categoryNode: true,
        protectedImages: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, width: true, height: true },
        },
      },
      take: 100,
    });

    const similarityFn = useWeightedSimilarity ? weightedCosineSimilarity : cosineSimilarity;

    const scored = products.map((product) => {
      const productVector = productToFeatureVector({
        title: product.title,
        description: product.description,
        category: product.category,
        categoryNode: product.categoryNode,
      });

      const similarity = similarityFn(queryVector, productVector);
      const categorySpecificity = detectedCategory
        ? productVisualCategorySpecificity(product, detectedCategory)
        : 0;

      const { images: _legacy, ...rest } = product;
      void _legacy;
      return {
        product: {
          ...rest,
          priceInRupees: rest.priceInRupees.toString(),
          auction: rest.auction
            ? {
                ...rest.auction,
                startingPriceCredits: rest.auction.startingPriceCredits.toString(),
                minIncrement: rest.auction.minIncrement.toString(),
                bidFee: rest.auction.bidFee?.toString() ?? null,
                priceStepPerBid: rest.auction.priceStepPerBid?.toString() ?? null,
              }
            : null,
        },
        featureVector: productVector,
        similarityScore: Math.round(similarity * 100) / 100,
        categoryMatches:
          detectedCategory === null ||
          (vectorMatchesGarmentCategory(productVector, detectedCategory) &&
            categorySpecificity > 0),
        categorySpecificity,
      };
    });

    const categoryMatches = detectedCategory
      ? scored.filter((item) => item.categoryMatches)
      : scored;
    const rankingPool = categoryMatches.length > 0 ? categoryMatches : scored;
    rankingPool.sort((a, b) =>
      b.categorySpecificity - a.categorySpecificity ||
      b.similarityScore - a.similarityScore
    );
    const top = rankingPool.slice(0, 15);

    return NextResponse.json({
      results: top.map((item) => ({
        ...item.product,
        featureVector: item.featureVector,
        similarityScore: item.similarityScore,
      })),
      totalScanned: products.length,
      detectedCategory,
      categoryFallbackUsed: Boolean(detectedCategory && categoryMatches.length === 0),
      queryVector,
      ...(analysisDetails ? { analysisDetails } : {}),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
