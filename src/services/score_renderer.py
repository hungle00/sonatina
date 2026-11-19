import verovio


def render_musicxml(
    content: bytes,
) -> tuple[list[str], str, list[dict[str, int | str | None]]]:
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

    pages = [
        toolkit.renderToSVG(page)
        for page in range(1, toolkit.getPageCount() + 1)
    ]
    midi_base64 = toolkit.renderToMIDI()
    raw_timeline = toolkit.renderToTimemap({
        "includeMeasures": True,
        "includeRests": True,
    })

    timeline = []
    current_page = 1

    for event in raw_timeline:
        measure_id = event.get("measureOn")
        cursor_ids = event.get("on") or event.get("restsOn") or []
        page_number = (
            toolkit.getPageWithElement(measure_id)
            if measure_id
            else 0
        )

        if not page_number:
            for element_id in cursor_ids:
                page_number = toolkit.getPageWithElement(element_id)
                if page_number:
                    break

        if page_number:
            current_page = page_number

        timeline.append({
            "time_ms": int(event["tstamp"]),
            "page": current_page - 1,
            "cursor_id": cursor_ids[0] if cursor_ids else None,
            "measure_id": measure_id,
        })

    next_cursor_event = None
    for event in reversed(timeline):
        if (
            next_cursor_event is not None
            and next_cursor_event["page"] != event["page"]
        ):
            next_cursor_event = None

        if not event["cursor_id"]:
            continue

        if next_cursor_event is not None:
            event["next_cursor_id"] = next_cursor_event["cursor_id"]
            event["next_time_ms"] = next_cursor_event["time_ms"]

        next_cursor_event = event

    return pages, midi_base64, timeline
