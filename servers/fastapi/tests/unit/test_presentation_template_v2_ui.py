from api.v1.ppt.endpoints import presentation as presentation_endpoint
from services.chat.memory_layer import PresentationChatMemoryLayer


def test_apply_template_v2_content_to_ui_uses_schema_content_keys():
    ui = {
        "id": "layout-1",
        "description": "Layout with generated content placeholders.",
        "components": [
            {
                "id": "hero",
                "description": "Hero content component.",
                "elements": [
                    {
                        "type": "text",
                        "decorative": False,
                        "name": "headline",
                        "runs": [{"text": "Old headline", "font": {"bold": True}}],
                    },
                    {
                        "type": "image",
                        "decorative": False,
                        "name": "hero_image",
                        "data": "/old-image.png",
                        "is_icon": False,
                    },
                    {
                        "type": "text-list",
                        "decorative": False,
                        "name": "bullets",
                        "items": [[{"text": "Old bullet"}]],
                    },
                    {
                        "type": "table",
                        "decorative": False,
                        "name": "metrics",
                        "columns": [{"runs": [{"text": "Old"}]}],
                        "rows": [[{"runs": [{"text": "Old value"}]}]],
                    },
                    {
                        "type": "chart",
                        "decorative": False,
                        "name": "trend",
                        "chart_type": "bar",
                        "categories": ["Old"],
                        "series": [{"name": "Old", "values": [1]}],
                    },
                    {
                        "type": "grid",
                        "name": "cards",
                        "children": [
                            {
                                "type": "group",
                                "name": "card_1",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_1",
                                        "runs": [{"text": "Old card 1"}],
                                    },
                                    {
                                        "type": "image",
                                        "decorative": False,
                                        "name": "icon_1",
                                        "data": "/old-icon-1.svg",
                                        "is_icon": True,
                                    },
                                ],
                            },
                            {
                                "type": "group",
                                "name": "card_2",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_2",
                                        "runs": [{"text": "Old card 2"}],
                                    },
                                    {
                                        "type": "image",
                                        "decorative": False,
                                        "name": "icon_2",
                                        "data": "/old-icon-2.svg",
                                        "is_icon": True,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "id": "metric_card",
                "description": "First metric card.",
                "elements": [
                    {
                        "type": "text",
                        "decorative": False,
                        "name": "value",
                        "runs": [{"text": "0%"}],
                    }
                ],
            },
            {
                "id": "metric_card",
                "description": "Second metric card.",
                "elements": [
                    {
                        "type": "text",
                        "decorative": False,
                        "name": "value",
                        "runs": [{"text": "0%"}],
                    }
                ],
            },
        ],
    }
    content = {
        "hero": {
            "headline": "Generated headline",
            "hero_image": {
                "image_prompt": "Team dashboard",
                "image_url": "/app_data/images/hero.png",
            },
            "bullets": ["First generated bullet", "Second generated bullet"],
            "metrics": {
                "columns": ["Region", "Sales"],
                "rows": [["US", 12], ["EU", True]],
            },
            "trend": {
                "title": "Growth",
                "chart_type": "line",
                "categories": ["Q1", "Q2"],
                "series": [{"name": "Revenue", "values": [10, 20]}],
                "data_labels": True,
            },
            "cards": [
                {
                    "title": "First card",
                    "icon": {"icon_query": "growth", "icon_url": "/icons/one.svg"},
                },
                {
                    "title": "Second card",
                    "icon": {"icon_query": "support", "icon_url": "/icons/two.svg"},
                },
            ],
        },
        "metric_card_0": {"value": "42%"},
        "metric_card_1": {"value": "21%"},
    }

    hydrated = presentation_endpoint._apply_template_v2_content_to_ui(ui, content)

    hero_elements = hydrated["components"][0]["elements"]
    assert hero_elements[0]["runs"] == [
        {"text": "Generated headline", "font": {"bold": True}}
    ]
    assert "text" not in hero_elements[0]
    assert hero_elements[1]["data"] == "/app_data/images/hero.png"
    assert hero_elements[1]["prompt"] == "Team dashboard"
    assert hero_elements[2]["items"] == [
        [{"text": "First generated bullet"}],
        [{"text": "Second generated bullet"}],
    ]
    assert hero_elements[3]["columns"][0]["runs"][0]["text"] == "Region"
    assert hero_elements[3]["rows"][0][1]["runs"][0]["text"] == "12"
    assert hero_elements[3]["rows"][1][1]["runs"][0]["text"] == "true"
    assert hero_elements[4]["chart_type"] == "line"
    assert hero_elements[4]["categories"] == ["Q1", "Q2"]
    assert hero_elements[4]["data_labels"] is True

    cards = hero_elements[5]["children"]
    assert cards[0]["children"][0]["runs"][0]["text"] == "First card"
    assert cards[0]["children"][1]["data"] == "/icons/one.svg"
    assert cards[0]["children"][1]["prompt"] == "growth"
    assert cards[1]["children"][0]["runs"][0]["text"] == "Second card"
    assert cards[1]["children"][1]["data"] == "/icons/two.svg"
    assert cards[1]["children"][1]["prompt"] == "support"

    assert hydrated["components"][1]["elements"][0]["runs"][0]["text"] == "42%"
    assert hydrated["components"][2]["elements"][0]["runs"][0]["text"] == "21%"
    assert "text" not in hydrated["components"][1]["elements"][0]
    assert "text" not in hydrated["components"][2]["elements"][0]
    assert ui["components"][0]["elements"][0]["runs"][0]["text"] == "Old headline"


def test_apply_template_v2_content_to_ui_parses_markdown_text_to_runs():
    ui = {
        "id": "layout-1",
        "description": "Layout with markdown generated content placeholders.",
        "components": [
            {
                "id": "hero",
                "description": "Hero content component.",
                "elements": [
                    {
                        "type": "text",
                        "decorative": False,
                        "name": "headline",
                        "runs": [
                            {
                                "text": "Old headline",
                                "font": {"family": "Inter", "size": 24},
                            }
                        ],
                    },
                    {
                        "type": "text-list",
                        "decorative": False,
                        "name": "bullets",
                        "items": [
                            [
                                {
                                    "text": "Old bullet",
                                    "font": {"color": "#111111", "size": 14},
                                }
                            ]
                        ],
                    },
                    {
                        "type": "table",
                        "decorative": False,
                        "name": "metrics",
                        "columns": [
                            {
                                "font": {"size": 10},
                                "runs": [
                                    {
                                        "text": "Old column",
                                        "font": {"size": 10},
                                    }
                                ],
                            }
                        ],
                        "rows": [
                            [
                                {
                                    "runs": [
                                        {
                                            "text": "Old value",
                                            "font": {"size": 9},
                                        }
                                    ]
                                }
                            ]
                        ],
                    },
                ],
            }
        ],
    }
    content = {
        "hero": {
            "headline": "AI **agents** need _memory_",
            "bullets": [
                "Keep **scope** tight",
                "Ship *incrementally*",
            ],
            "metrics": {
                "columns": ["__Metric__"],
                "rows": [["*Retention*"]],
            },
        }
    }

    hydrated = presentation_endpoint._apply_template_v2_content_to_ui(ui, content)

    elements = hydrated["components"][0]["elements"]
    assert elements[0]["runs"] == [
        {"text": "AI ", "font": {"family": "Inter", "size": 24}},
        {
            "text": "agents",
            "font": {"family": "Inter", "size": 24, "bold": True},
        },
        {"text": " need ", "font": {"family": "Inter", "size": 24}},
        {
            "text": "memory",
            "font": {"family": "Inter", "size": 24, "italic": True},
        },
    ]
    assert elements[1]["items"] == [
        [
            {"text": "Keep ", "font": {"color": "#111111", "size": 14}},
            {
                "text": "scope",
                "font": {"color": "#111111", "size": 14, "bold": True},
            },
            {"text": " tight", "font": {"color": "#111111", "size": 14}},
        ],
        [
            {"text": "Ship "},
            {
                "text": "incrementally",
                "font": {"italic": True},
            },
        ],
    ]
    assert elements[2]["columns"][0]["runs"] == [
        {"text": "Metric", "font": {"size": 10, "bold": True}}
    ]
    assert elements[2]["rows"][0][0]["runs"] == [
        {"text": "Retention", "font": {"size": 9, "italic": True}}
    ]


def test_chat_template_v2_image_content_stores_prompt():
    image = {
        "type": "image",
        "decorative": False,
        "name": "hero_image",
        "data": "/old-image.png",
        "is_icon": False,
    }
    PresentationChatMemoryLayer._set_template_v2_element_value(
        image,
        {
            "image_prompt": "Analytics dashboard",
            "image_url": "/app_data/images/dashboard.png",
        },
    )

    assert image["data"] == "/app_data/images/dashboard.png"
    assert image["prompt"] == "Analytics dashboard"

    icon = {
        "type": "image",
        "decorative": False,
        "name": "status_icon",
        "data": "/old-icon.svg",
        "is_icon": True,
    }
    PresentationChatMemoryLayer._set_template_v2_element_value(
        icon,
        {
            "icon_query": "success check",
            "icon_url": "/icons/check.svg",
        },
    )

    assert icon["data"] == "/icons/check.svg"
    assert icon["prompt"] == "success check"


def test_apply_template_v2_content_to_ui_matches_repeated_content_lengths():
    ui = {
        "id": "layout-1",
        "description": "Layout with repeated generated content.",
        "components": [
            {
                "id": "repeated",
                "description": "Repeated content component.",
                "elements": [
                    {
                        "type": "flex",
                        "name": "flex_cards",
                        "min_children": 2,
                        "max_children": 3,
                        "children": [
                            {
                                "type": "group",
                                "name": "flex_card_1",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_1",
                                        "runs": [{"text": "Flex one"}],
                                    }
                                ],
                            },
                            {
                                "type": "group",
                                "name": "flex_card_2",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_2",
                                        "runs": [{"text": "Flex two"}],
                                    }
                                ],
                            },
                            {
                                "type": "group",
                                "name": "flex_card_3",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_3",
                                        "runs": [{"text": "Flex three"}],
                                    }
                                ],
                            },
                        ],
                    },
                    {
                        "type": "grid",
                        "name": "grid_cards",
                        "min_children": 2,
                        "max_children": 3,
                        "children": [
                            {
                                "type": "group",
                                "name": "grid_card_1",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_1",
                                        "runs": [{"text": "Grid one"}],
                                    }
                                ],
                            },
                            {
                                "type": "group",
                                "name": "grid_card_2",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_2",
                                        "runs": [{"text": "Grid two"}],
                                    }
                                ],
                            },
                            {
                                "type": "group",
                                "name": "grid_card_3",
                                "children": [
                                    {
                                        "type": "text",
                                        "decorative": False,
                                        "name": "title_3",
                                        "runs": [{"text": "Grid three"}],
                                    }
                                ],
                            },
                        ],
                    },
                    {
                        "type": "text-list",
                        "decorative": False,
                        "name": "bullets",
                        "min_items": 2,
                        "max_items": 3,
                        "items": [
                            [{"text": "Bullet one"}],
                            [{"text": "Bullet two"}],
                            [{"text": "Bullet three"}],
                        ],
                    },
                ],
            }
        ],
    }
    content = {
        "repeated": {
            "flex_cards": [
                {"title": "Generated flex one"},
                {"title": "Generated flex two"},
            ],
            "grid_cards": [
                {"title": "Generated grid one"},
                {"title": "Generated grid two"},
            ],
            "bullets": ["Generated bullet one", "Generated bullet two"],
        }
    }

    hydrated = presentation_endpoint._apply_template_v2_content_to_ui(ui, content)

    elements = hydrated["components"][0]["elements"]
    flex_children = elements[0]["children"]
    grid_children = elements[1]["children"]
    text_list_items = elements[2]["items"]

    assert len(flex_children) == 2
    assert flex_children[0]["children"][0]["runs"][0]["text"] == "Generated flex one"
    assert flex_children[1]["children"][0]["runs"][0]["text"] == "Generated flex two"
    assert len(grid_children) == 2
    assert grid_children[0]["children"][0]["runs"][0]["text"] == "Generated grid one"
    assert grid_children[1]["children"][0]["runs"][0]["text"] == "Generated grid two"
    assert text_list_items == [
        [{"text": "Generated bullet one"}],
        [{"text": "Generated bullet two"}],
    ]
