export type SearchIntent = {
  key: string;
  label: string;
  preferredPaths: string[];
  compatibleRoots: string[];
};

type IntentDefinition = SearchIntent & { terms: string[] };

const INTENTS: IntentDefinition[] = [
  { key: 'shorts', label: 'shorts', preferredPaths: ['bottoms/denim-shorts'], compatibleRoots: ['bottoms'], terms: ['short', 'shorts', 'bermuda', 'bermudas'] },
  { key: 'jeans', label: 'jeans', preferredPaths: ['bottoms/jeans'], compatibleRoots: ['bottoms'], terms: ['jean', 'jeans', 'denim jeans'] },
  { key: 'skirts', label: 'skirts', preferredPaths: ['bottoms/denim-skirt'], compatibleRoots: ['bottoms'], terms: ['skirt', 'skirts'] },
  { key: 'bottoms', label: 'bottomwear', preferredPaths: ['bottoms'], compatibleRoots: ['bottoms'], terms: ['bottom', 'bottoms', 'bottomwear', 'pant', 'pants', 'trouser', 'trousers', 'chino', 'chinos', 'jogger', 'joggers', 'legging', 'leggings'] },
  { key: 't-shirts', label: 'T-shirts', preferredPaths: ['t-shirt'], compatibleRoots: ['t-shirt', 'tops', 'crop-tops'], terms: ['tshirt', 'tshirts', 't shirt', 't shirts', 'tee', 'tees', 'polo', 'polos'] },
  { key: 'shirts', label: 'shirts', preferredPaths: ['shirt'], compatibleRoots: ['shirt', 'tops'], terms: ['shirt', 'shirts', 'blouse', 'blouses', 'button up', 'button down', 'overshirt'] },
  { key: 'tops', label: 'tops', preferredPaths: ['tops', 'crop-tops'], compatibleRoots: ['tops', 'crop-tops', 't-shirt'], terms: ['top', 'tops', 'crop top', 'crop tops', 'camisole', 'camisoles', 'tank top', 'tank tops', 'tunic', 'tunics'] },
  { key: 'dresses', label: 'dresses', preferredPaths: ['dress'], compatibleRoots: ['dress'], terms: ['dress', 'dresses', 'gown', 'gowns', 'frock', 'frocks'] },
  { key: 'outerwear', label: 'outerwear', preferredPaths: ['jackets', 'denim-jackets'], compatibleRoots: ['jackets', 'denim-jackets', 'shrug'], terms: ['jacket', 'jackets', 'coat', 'coats', 'blazer', 'blazers', 'outerwear'] },
  { key: 'hoodies', label: 'hoodies', preferredPaths: ['hoodie', 'sweatshirt'], compatibleRoots: ['hoodie', 'sweatshirt', 'sweater'], terms: ['hoodie', 'hoodies', 'hooded sweatshirt'] },
  { key: 'knitwear', label: 'knitwear', preferredPaths: ['sweater', 'sweatshirt'], compatibleRoots: ['sweater', 'sweatshirt', 'hoodie'], terms: ['sweater', 'sweaters', 'sweatshirt', 'sweatshirts', 'jumper', 'jumpers', 'pullover', 'pullovers', 'knitwear'] },
  { key: 'shrugs', label: 'shrugs', preferredPaths: ['shrug'], compatibleRoots: ['shrug', 'jackets'], terms: ['shrug', 'shrugs', 'cardigan', 'cardigans'] },
];

function phraseOccurs(query: string, phrase: string): boolean {
  return (` ${query} `).includes(` ${phrase} `);
}

export function inferSearchIntent(normalizedQuery: string): SearchIntent | null {
  const match = INTENTS.find((intent) =>
    [...intent.terms].sort((a, b) => b.length - a.length).some((term) => phraseOccurs(normalizedQuery, term))
  );

  if (!match) return null;
  const { terms: _terms, ...intent } = match;
  void _terms;
  return intent;
}

export function rootOfCategoryPath(path: string): string {
  return path.toLowerCase().split('/')[0] ?? path.toLowerCase();
}

export function isCategoryCompatible(path: string, intent: SearchIntent): boolean {
  const normalizedPath = path.toLowerCase();
  return intent.compatibleRoots.some(
    (root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`)
  );
}
