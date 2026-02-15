    document.addEventListener("DOMContentLoaded", function () {
        const config = window.TNC_TREE_FILTER_CFG;
        if (!config || !Array.isArray(config.filters) || config.filters.length === 0) return;

        const filterConfigs = config.filters
            .filter((item) => item && item.taxonomy)
            .map((item) => ({
                taxonomy: item.taxonomy,
                title: item.title || item.taxonomy
            }));

        const templatesByTaxonomy = {};
        document.querySelectorAll("template[data-tnc-tree-taxonomy]").forEach((template) => {
            const taxonomy = template.getAttribute("data-tnc-tree-taxonomy");
            if (taxonomy) templatesByTaxonomy[taxonomy] = template;
        });

        const normalizeText = (value) => String(value || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

        const parseTaxQueryClauses = (params) => {
            const clauses = {};
            params.forEach((value, key) => {
                const match = key.match(/^taxquery\[(\d+)\]\[(taxonomy|compare|terms)\](?:\[(\d+)\])?$/);
                if (!match) return;
                const index = match[1];
                const part = match[2];
                const termIndex = match[3];
                if (!clauses[index]) clauses[index] = { terms: [] };

                if (part === "terms") {
                    const parsedValue = Number(value);
                    if (Number.isFinite(parsedValue) && parsedValue > 0) {
                        if (termIndex !== undefined) clauses[index].terms[Number(termIndex)] = String(parsedValue);
                        else clauses[index].terms.push(String(parsedValue));
                    }
                } else {
                    clauses[index][part] = value;
                }
            });

            return Object.keys(clauses)
                .sort((a, b) => Number(a) - Number(b))
                .map((index) => ({
                    taxonomy: clauses[index].taxonomy,
                    compare: clauses[index].compare || "IN",
                    terms: (clauses[index].terms || []).filter(Boolean)
                }))
                .filter((clause) => clause.taxonomy && clause.terms.length > 0);
        };

        const serializeTaxQueryClauses = (params, clauses) => {
            Array.from(params.keys()).forEach((key) => {
                if (key.startsWith("taxquery[")) params.delete(key);
            });

            clauses.forEach((clause, index) => {
                params.set(`taxquery[${index}][taxonomy]`, clause.taxonomy);
                params.set(`taxquery[${index}][compare]`, clause.compare || "IN");
                clause.terms.forEach((termId, termIndex) => {
                    params.set(`taxquery[${index}][terms][${termIndex}]`, termId);
                });
            });
        };

        const handleChange = (event) => {
            const tree = event && event.target ? event.target.closest(".tnc-tree-filter") : null;
            if (!tree) return;
            const taxonomy = tree.getAttribute("data-taxonomy");
            if (!taxonomy) return;

            const checked = Array.from(tree.querySelectorAll(".tnc-tree-checkbox:checked"))
                .map((el) => String(el.value));

            const url = new URL(window.location.href);
            const params = url.searchParams;
            const existingClauses = parseTaxQueryClauses(params);
            const retainedClauses = existingClauses.filter((clause) => clause.taxonomy !== taxonomy);

            if (checked.length) {
                retainedClauses.push({
                    taxonomy: taxonomy,
                    compare: "IN",
                    terms: checked
                });
            }

            serializeTaxQueryClauses(params, retainedClauses);
            url.search = params.toString();
            window.location.href = url.toString();
        };

        const setNodeCollapsed = (node, collapsed) => {
            if (!node || !node.classList.contains("tnc-tree-node--has-children")) return;
            node.classList.toggle("is-collapsed", !!collapsed);
            const row = node.children && node.children[0];
            const toggle = row ? row.querySelector(".tnc-tree-toggle") : null;
            if (toggle) {
                toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
            }
        };

        const setTreeCollapsed = (tree, collapsed) => {
            if (!tree) return;
            const header = tree.querySelector(".tnc-tree-filter__header");
            const content = tree.querySelector(".tnc-tree-filter__content");
            const icon = header ? header.querySelector(".icon > i") : null;

            if (content) {
                content.style.display = collapsed ? "none" : "";
            }
            if (header) {
                header.setAttribute("aria-expanded", collapsed ? "false" : "true");
            }
            if (icon) {
                icon.classList.toggle("tainacan-icon-arrowdown", !collapsed);
                icon.classList.toggle("tainacan-icon-arrowright", collapsed);
                icon.classList.toggle("tainacan-icon-is-rtl-mirrored", collapsed);
            }
        };

        const collapseOrExpandAll = (tree, collapsed) => {
            if (!tree) return;
            setTreeCollapsed(tree, collapsed);
            tree.querySelectorAll(".tnc-tree-node--has-children").forEach((node) => {
                setNodeCollapsed(node, collapsed);
            });
        };

        const bindTreeControls = (tree, sidebar) => {
            if (!tree) return;

            const header = tree.querySelector(".tnc-tree-filter__header");
            if (header && !header.__tncBound) {
                header.addEventListener("click", () => {
                    const isExpanded = header.getAttribute("aria-expanded") !== "false";
                    setTreeCollapsed(tree, isExpanded);
                });
                header.__tncBound = true;
            }

            tree.querySelectorAll(".tnc-tree-toggle").forEach((toggle) => {
                if (toggle.classList.contains("tnc-tree-toggle--placeholder")) return;
                if (toggle.__tncBound) return;
                toggle.addEventListener("click", () => {
                    const node = toggle.closest(".tnc-tree-node");
                    if (!node) return;
                    const nextCollapsed = !node.classList.contains("is-collapsed");
                    setNodeCollapsed(node, nextCollapsed);
                });
                toggle.__tncBound = true;
            });

            if (sidebar) {
                const nativeCollapseAllButton = sidebar.querySelector(".collapse-all");
                if (nativeCollapseAllButton && !nativeCollapseAllButton.__tncTreeBound) {
                    nativeCollapseAllButton.addEventListener("click", () => {
                        window.setTimeout(() => {
                            const expanded = nativeCollapseAllButton.getAttribute("aria-expanded");
                            const shouldCollapse = expanded === "false";
                            const trees = sidebar.querySelectorAll(".tnc-tree-filter");
                            trees.forEach((aTree) => collapseOrExpandAll(aTree, shouldCollapse));
                        }, 0);
                    });
                    nativeCollapseAllButton.__tncTreeBound = true;
                }
            }
        };

        const getSelectedTermsForTaxonomy = (taxonomy) => {
            const url = new URL(window.location.href);
            const clauses = parseTaxQueryClauses(url.searchParams);
            const clause = clauses.find((item) => item.taxonomy === taxonomy);
            return new Set(clause && Array.isArray(clause.terms) ? clause.terms.map((id) => String(id)) : []);
        };

        const syncCheckedStateFromUrl = (treeRoot, taxonomyConfig) => {
            const selectedTerms = getSelectedTermsForTaxonomy(taxonomyConfig.taxonomy);
            treeRoot.querySelectorAll(".tnc-tree-checkbox").forEach((checkbox) => {
                checkbox.checked = selectedTerms.has(String(checkbox.value));
            });
        };

    const getTreeRootNodes = (treeRoot) => {
        if (!treeRoot) return [];
        const treeContainer = treeRoot.querySelector(".tnc-tree-filter__tree");
        if (!treeContainer) return [];
        return Array.from(treeContainer.children)
            .filter((node) => node.classList && node.classList.contains("tnc-tree-node"));
    };

        const getTreeRootValue = (treeRootNode) => {
            const row = treeRootNode.children && treeRootNode.children[0];
            const input = row ? row.querySelector(".tnc-tree-checkbox") : null;
            return input ? String(input.value || "") : "";
        };

        const getNativeTopLevelOptionIds = (filterItem) => {
            const ids = new Set();
            if (!filterItem) return ids;
            filterItem.querySelectorAll(".metadatum > label input[data-filter-option-value]").forEach((input) => {
                const value = String(input.getAttribute("data-filter-option-value") || "");
                if (value) ids.add(value);
            });
        if (ids.size === 0) {
            filterItem.querySelectorAll(".metadatum > label input").forEach((input) => {
                const value = String(input.value || input.getAttribute("value") || "");
                if (value) ids.add(value);
            });
        }
            return ids;
        };

        const pruneTreeRootsByAllowedIds = (treeRoot, allowedIds) => {
            if (!allowedIds || allowedIds.size === 0) return false;
            const rootNodes = getTreeRootNodes(treeRoot);
        const nodesToKeep = [];

        rootNodes.forEach((node) => {
                const rootValue = getTreeRootValue(node);
                const shouldKeep = rootValue && allowedIds.has(rootValue);
            if (shouldKeep) nodesToKeep.push(node);
            });

        // Never hide everything: only apply pruning when we have a confirmed match.
        if (nodesToKeep.length === 0) {
            rootNodes.forEach((node) => {
                node.style.display = "";
            });
            return false;
        }

        rootNodes.forEach((node) => {
            node.style.display = nodesToKeep.includes(node) ? "" : "none";
        });

        return true;
        };

        const findMatchingNativeFilterItem = (sidebar, taxonomyConfig) => {
            const title = normalizeText(taxonomyConfig.title);
            const items = Array.from(sidebar.querySelectorAll(".filter-item-forms"));
            for (const item of items) {
                if (item.closest(".tnc-tree-filter")) continue;
                const label = normalizeText(item.querySelector(".collapse-label") ? item.querySelector(".collapse-label").textContent : "");
                const hasViewAll = !!item.querySelector(".view-all-button");
                if (hasViewAll && label === title) return item;
            }
            return null;
        };

        const mountOneTaxonomy = (sidebar, taxonomyConfig) => {
            const template = templatesByTaxonomy[taxonomyConfig.taxonomy];
            if (!template) return false;

            const nativeFilterItem = findMatchingNativeFilterItem(sidebar, taxonomyConfig);
            if (!nativeFilterItem) return false;

            const allowedRootIds = getNativeTopLevelOptionIds(nativeFilterItem);
            if (allowedRootIds.size === 0) return false;

            let tree = sidebar.querySelector(`.tnc-tree-filter[data-taxonomy="${taxonomyConfig.taxonomy}"]`);
            if (!tree) {
                const fragment = template.content.cloneNode(true);
                nativeFilterItem.parentNode.insertBefore(fragment, nativeFilterItem);
                tree = sidebar.querySelector(`.tnc-tree-filter[data-taxonomy="${taxonomyConfig.taxonomy}"]`);
            }
            if (!tree) return false;

            const scoped = pruneTreeRootsByAllowedIds(tree, allowedRootIds);
            if (!scoped) return false;

            syncCheckedStateFromUrl(tree, taxonomyConfig);
            bindTreeControls(tree, sidebar);
            tree.querySelectorAll(".tnc-tree-checkbox").forEach((checkbox) => {
                checkbox.removeEventListener("change", handleChange);
                checkbox.addEventListener("change", handleChange);
            });

            nativeFilterItem.style.display = "none";
            return true;
        };

        const mountAll = () => {
            document.querySelectorAll("#filters-items-list, .tainacan-filters-container").forEach((sidebar) => {
                filterConfigs.forEach((taxonomyConfig) => {
                    mountOneTaxonomy(sidebar, taxonomyConfig);
                });
            });
        };

        mountAll();

        const observer = new MutationObserver(() => {
            mountAll();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
