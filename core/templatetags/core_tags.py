# core/templatetags/core_tags.py
from django import template

register = template.Library()

@register.filter
def multiply(value, arg):
    """Умножает значение на аргумент"""
    try:
        return int(value) * int(arg)
    except (ValueError, TypeError):
        return 0

@register.filter
def get_item(dictionary, key):
    """Получить значение из словаря по ключу"""
    return dictionary.get(key)