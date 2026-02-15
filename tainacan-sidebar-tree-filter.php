<?php
/**
 * Plugin Name: Tainacan Sidebar Tree Filter
 * Description: Replaces the default Tainacan taxonomy filter with a fully expanded hierarchical tree.
 * Version: 1.2
 * Author: Lefaucheux Museum
 */

if (!defined('ABSPATH')) exit;

add_action('wp_enqueue_scripts', function () {
    if (is_admin()) return;
    if (!tnc_tree_filter_should_load_on_current_page()) return;

    $css_path = plugin_dir_path(__FILE__) . 'tree.css';
    $js_path = plugin_dir_path(__FILE__) . 'tree.js';
    $css_version = file_exists($css_path) ? (string) filemtime($css_path) : '1.2';
    $js_version = file_exists($js_path) ? (string) filemtime($js_path) : '1.2';

    wp_enqueue_style('tnc-tree-filter', plugin_dir_url(__FILE__) . 'tree.css', [], $css_version);
    wp_enqueue_script('tnc-tree-filter', plugin_dir_url(__FILE__) . 'tree.js', [], $js_version, true);

    $taxonomies = tnc_tree_filter_get_target_taxonomies();
    $filters_config = [];
    foreach ($taxonomies as $taxonomy => $taxonomy_obj) {
        $filters_config[] = [
            'taxonomy' => $taxonomy,
            'title' => tnc_tree_filter_get_taxonomy_title($taxonomy_obj),
            'termIds' => tnc_tree_filter_get_term_ids($taxonomy)
        ];
    }

    wp_localize_script('tnc-tree-filter', 'TNC_TREE_FILTER_CFG', [
        'filters' => $filters_config
    ]);
});

add_action('wp_footer', function () {
    if (is_admin()) return;
    if (!tnc_tree_filter_should_load_on_current_page()) return;

    $taxonomies = tnc_tree_filter_get_target_taxonomies();
    if (empty($taxonomies)) return;

    foreach ($taxonomies as $taxonomy => $taxonomy_obj) {
        $selected_terms = tnc_tree_filter_get_selected_terms($taxonomy);
        $tree_roots = tnc_tree_filter_get_tree_roots($taxonomy);
        if (empty($tree_roots)) {
            continue;
        }
        $content_id = 'tnc-tree-content-' . sanitize_html_class($taxonomy);
        $title = tnc_tree_filter_get_taxonomy_title($taxonomy_obj);

        echo '<template id="tnc-tree-filter-template-'.esc_attr($taxonomy).'" data-tnc-tree-taxonomy="'.esc_attr($taxonomy).'">';
        echo '<div class="tnc-tree-filter" data-taxonomy="'.esc_attr($taxonomy).'">';
        echo '<div class="collapse show tnc-tree-filter__collapse">';
        echo '<div class="collapse-trigger">';
        echo '<button type="button" class="label tnc-tree-filter__header" aria-expanded="true" aria-controls="'.esc_attr($content_id).'" aria-label="'.esc_attr($title).'">';
        echo '<span aria-hidden="true" class="icon"><i class="tainacan-icon-arrowdown tainacan-icon tainacan-icon-1-25em"></i></span>';
        echo '<span class="collapse-label">'.esc_html($title).'</span>';
        echo '</button>';
        echo '</div>';
        echo '<div id="'.esc_attr($content_id).'" class="collapse-content tnc-tree-filter__content">';
        echo '<div class="tnc-tree-filter__tree">';
        foreach ($tree_roots as $root_term) {
            echo tnc_tree_filter_render_node($root_term, $taxonomy, $selected_terms, true);
        }
        echo '</div>';
        echo '</div>';
        echo '</div>';
        echo '</div></template>';
    }
});

function tnc_tree_filter_should_load_on_current_page() {
    // Keep this portable across unknown route structures:
    // use content signals when available, but default to true.
    $post = get_post(get_queried_object_id());
    if ($post && isset($post->post_content) && is_string($post->post_content)) {
        if (
            has_shortcode($post->post_content, 'tainacan_items_list')
            || has_shortcode($post->post_content, 'tainacan_items_list_tag')
            || has_block('tainacan/faceted-search', $post)
            || has_block('tainacan/items-list', $post)
        ) {
            return (bool) apply_filters('tnc_tree_filter_should_load_on_current_page', true);
        }
    }

    return (bool) apply_filters('tnc_tree_filter_should_load_on_current_page', true);
}

function tnc_tree_filter_get_target_taxonomies() {
    $all_taxonomies = get_taxonomies([], 'objects');
    $target_taxonomies = [];

    foreach ($all_taxonomies as $taxonomy => $taxonomy_obj) {
        if (strpos($taxonomy, 'tnc_tax_') !== 0) {
            continue;
        }
        if (!is_object($taxonomy_obj)) {
            continue;
        }
        $target_taxonomies[$taxonomy] = $taxonomy_obj;
    }

    return $target_taxonomies;
}

function tnc_tree_filter_get_taxonomy_title($taxonomy_obj) {
    if (isset($taxonomy_obj->labels) && isset($taxonomy_obj->labels->singular_name) && $taxonomy_obj->labels->singular_name) {
        return $taxonomy_obj->labels->singular_name;
    }
    if (isset($taxonomy_obj->label) && $taxonomy_obj->label) {
        return $taxonomy_obj->label;
    }
    if (isset($taxonomy_obj->name) && $taxonomy_obj->name) {
        return (string) $taxonomy_obj->name;
    }
    return 'Taxonomy';
}

function tnc_tree_filter_get_selected_terms($taxonomy) {
    $selected_terms = [];

    if (!isset($_GET['taxquery']) || !is_array($_GET['taxquery'])) {
        return $selected_terms;
    }

    foreach ($_GET['taxquery'] as $clause) {
        if (!is_array($clause)) {
            continue;
        }

        if (!isset($clause['taxonomy']) || $clause['taxonomy'] !== $taxonomy) {
            continue;
        }

        if (!isset($clause['terms'])) {
            continue;
        }

        $terms = is_array($clause['terms']) ? $clause['terms'] : [$clause['terms']];
        foreach ($terms as $term_id) {
            $term_id = (int) $term_id;
            if ($term_id > 0) {
                $selected_terms[$term_id] = $term_id;
            }
        }
    }

    return array_values($selected_terms);
}

function tnc_tree_filter_get_term_ids($taxonomy) {
    $term_ids = [];

    $all_ids = get_terms([
        'taxonomy' => $taxonomy,
        'hide_empty' => false,
        'fields' => 'ids'
    ]);

    if (!is_wp_error($all_ids) && is_array($all_ids)) {
        foreach ($all_ids as $term_id) {
            $term_id = (int) $term_id;
            if ($term_id > 0) {
                $term_ids[$term_id] = $term_id;
            }
        }
    }

    return array_values($term_ids);
}

function tnc_tree_filter_get_tree_roots($taxonomy) {
    $top_level_terms = get_terms([
        'taxonomy' => $taxonomy,
        'hide_empty' => false,
        'parent' => 0
    ]);

    if (is_wp_error($top_level_terms) || empty($top_level_terms)) {
        return [];
    }

    return $top_level_terms;
}

function tnc_tree_filter_render_node($term, $taxonomy, $selected_terms = [], $selectable = true) {

    $children = get_terms([
        'taxonomy' => $taxonomy,
        'hide_empty' => false,
        'parent' => $term->term_id
    ]);

    $has_children = !empty($children);
    $html = '<div class="tnc-tree-node'.($has_children ? ' tnc-tree-node--has-children' : '').'">';
    $html .= '<div class="tnc-tree-row">';

    if ($has_children) {
        $html .= '<button type="button" class="tnc-tree-toggle" aria-expanded="true" aria-label="Toggle children"></button>';
    } else {
        $html .= '<span class="tnc-tree-toggle tnc-tree-toggle--placeholder" aria-hidden="true"></span>';
    }

    if ($selectable) {
        $checked_attr = in_array((int) $term->term_id, $selected_terms, true) ? ' checked="checked"' : '';
        $html .= '<label class="b-checkbox checkbox is-small">';
        $html .= '<input type="checkbox" value="'.esc_attr($term->term_id).'" data-filter-option-value="'.esc_attr($term->term_id).'" class="tnc-tree-checkbox"'.$checked_attr.'>';
        $html .= '<span class="check"></span>';
        $html .= '<span class="control-label"><span class="checkbox-label-text">'.esc_html($term->name).'</span></span>';
        $html .= '</label>';
    } else {
        $html .= '<strong>'.esc_html($term->name).'</strong>';
    }

    $html .= '</div>';

    if (!empty($children)) {
        $html .= '<div class="tnc-tree-children">';
        foreach ($children as $child) {
            $html .= tnc_tree_filter_render_node($child, $taxonomy, $selected_terms, true);
        }
        $html .= '</div>';
    }

    $html .= '</div>';

    return $html;
}
