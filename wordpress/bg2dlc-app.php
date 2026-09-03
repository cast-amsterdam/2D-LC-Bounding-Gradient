<?php
/**
 * Plugin Name: 2D-LC Bounding Gradient
 * Description: Browser-local 2D-LC bounding-gradient analysis for Elementor and WordPress.
 * Version: 1.0.16
 * Author: 2D-LC Bounding Gradient project
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

define('BG2DLC_VERSION', '1.0.16');

function bg2dlc_register_assets() {
    $base = plugin_dir_url(__FILE__) . 'assets/';
    $path = plugin_dir_path(__FILE__) . 'assets/';
    $css_version = BG2DLC_VERSION . '-' . filemtime($path . 'bg2dlc.css');
    $js_version = BG2DLC_VERSION . '-' . filemtime($path . 'bg2dlc.js');
    wp_register_style('bg2dlc-app', $base . 'bg2dlc.css', array(), $css_version);
    wp_register_script('bg2dlc-app', $base . 'bg2dlc.js', array(), $js_version, array(
        'in_footer' => true,
        'strategy' => 'defer',
    ));
}
add_action('wp_enqueue_scripts', 'bg2dlc_register_assets');

function bg2dlc_shortcode($atts = array()) {
    $atts = shortcode_atts(array(
        'max_file_mb' => '50',
        'max_cells' => '2000000',
    ), $atts, 'bg2dlc_app');

    $max_file_mb = max(1, min(500, absint($atts['max_file_mb'])));
    $max_cells = max(1000, min(50000000, absint($atts['max_cells'])));
    $instance_id = wp_unique_id('bg2dlc-');

    wp_enqueue_style('bg2dlc-app');
    wp_enqueue_script('bg2dlc-app');

    return sprintf(
        '<div id="%1$s" data-bg2dlc-app data-assets-base="%2$s" data-example-url="%3$s" data-max-file-mb="%4$d" data-max-cells="%5$d"></div>',
        esc_attr($instance_id),
        esc_url(plugin_dir_url(__FILE__) . 'assets/brand/'),
        esc_url(plugin_dir_url(__FILE__) . 'assets/example/MixTest.xlsx'),
        $max_file_mb,
        $max_cells
    );
}
add_shortcode('bg2dlc_app', 'bg2dlc_shortcode');
