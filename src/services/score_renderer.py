import verovio


def render_musicxml(content: bytes) -> list[str]:
    xml = content.decode("utf-8-sig")

    toolkit = verovio.toolkit()

    toolkit.setOptions({
        "svgAdditionalAttribute": [
            "note@pname",
            "note@oct",
            "note@dur",
            "note@accid",
            "note@dots",
        ]
    })

    if not toolkit.loadData(xml):
        raise ValueError("Invalid MusicXML file")

    return [
        toolkit.renderToSVG(page)
        for page in range(1, toolkit.getPageCount() + 1)
    ]
