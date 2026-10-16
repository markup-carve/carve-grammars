<?php

declare(strict_types=1);

require $argv[1] . '/vendor/autoload.php';

use MarkupCarve\Carve\CarveConverter;
use MarkupCarve\Carve\ProseMirror\ProseMirrorRenderer;
use MarkupCarve\Carve\ProseMirror\ProseMirrorToCarve;

$input = (string)stream_get_contents(STDIN);
if ($argv[2] === 'to-json') {
    $document = CarveConverter::carve()->parse($input);
    $renderer = new ProseMirrorRenderer();
    $json = $renderer->renderJson($document);
    echo json_encode([
        'json' => json_decode($json, true, 512, JSON_THROW_ON_ERROR),
        'dropped' => $renderer->droppedTypes(),
        'degraded' => $renderer->degradedTypes(),
    ], JSON_THROW_ON_ERROR);
    exit;
}
if ($argv[2] === 'to-carve') {
    $converter = new ProseMirrorToCarve();
    $document = $converter->convertJson($input);
    echo json_encode([
        'source' => CarveConverter::carve()->render($document),
        'dropped' => $converter->droppedAttributes(),
        'degraded' => $converter->degradedAttributes(),
    ], JSON_THROW_ON_ERROR);
    exit;
}
fwrite(STDERR, "Unknown conversion direction\n");
exit(2);
